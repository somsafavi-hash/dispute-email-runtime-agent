import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";

export class DisputeEmailRuntimeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const asanaProjectGid = new cdk.CfnParameter(this, "AsanaBushProjectGid", {
      type: "String",
      description: "Asana project gid for the Bush approval project.",
    });
    const asanaWorkspaceGid = new cdk.CfnParameter(this, "AsanaWorkspaceGid", {
      type: "String",
      default: "",
      description: "Optional Asana workspace gid used to resolve users by email.",
    });
    const asanaPatSecretName = new cdk.CfnParameter(this, "AsanaPatSecretName", {
      type: "String",
      default: "dispute-email-runtime/asana-pat",
      description: "Secrets Manager secret name containing the Asana PAT.",
    });

    const approvalTable = new dynamodb.Table(this, "ApprovalTokenTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: "expiresAt",
    });

    const asanaPatSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "AsanaPatSecret",
      asanaPatSecretName.valueAsString,
    );

    const commonEnvironment = {
      ASANA_BUSH_PROJECT_GID: asanaProjectGid.valueAsString,
      ASANA_WORKSPACE_GID: asanaWorkspaceGid.valueAsString,
      POWERTOOLS_LOG_LEVEL: "INFO",
      POWERTOOLS_SERVICE_NAME: "dispute-email-runtime-agent",
    };

    const startWorkflowFunction = this.nodeFunction("StartEmailWorkflowFunction", {
      entry: "src/handlers/start-email-workflow.ts",
      environment: {
        ...commonEnvironment,
        EXECUTION_NAME_PREFIX: "dispute-email-",
      },
    });

    const createApprovalTaskFunction = this.nodeFunction("CreateAsanaApprovalTaskFunction", {
      entry: "src/handlers/create-asana-approval-task.ts",
      timeout: cdk.Duration.seconds(60),
      environment: {
        ...commonEnvironment,
        APPROVAL_TABLE_NAME: approvalTable.tableName,
        ASANA_ACCESS_TOKEN_SECRET_ARN: asanaPatSecret.secretArn,
      },
    });

    const asanaWebhookFunction = this.nodeFunction("AsanaApprovalWebhookFunction", {
      entry: "src/handlers/asana-approval-webhook.ts",
      timeout: cdk.Duration.seconds(60),
      environment: {
        ...commonEnvironment,
        APPROVAL_TABLE_NAME: approvalTable.tableName,
        ASANA_ACCESS_TOKEN_SECRET_ARN: asanaPatSecret.secretArn,
      },
    });

    const finalizeApprovedEmailFunction = this.nodeFunction("FinalizeApprovedEmailFunction", {
      entry: "src/handlers/finalize-approved-email.ts",
      environment: commonEnvironment,
    });

    approvalTable.grantReadWriteData(createApprovalTaskFunction);
    approvalTable.grantReadWriteData(asanaWebhookFunction);
    asanaPatSecret.grantRead(createApprovalTaskFunction);
    asanaPatSecret.grantRead(asanaWebhookFunction);

    const createApprovalAndWait = new tasks.LambdaInvoke(this, "CreateAsanaApprovalAndWait", {
      lambdaFunction: createApprovalTaskFunction,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      payload: sfn.TaskInput.fromObject({
        taskToken: sfn.JsonPath.taskToken,
        "requestId.$": "$.requestId",
        "sender.$": "$.sender",
        "receiver.$": "$.receiver",
        "approver.$": "$.approver",
        "preparedEmail.$": "$.preparedEmail",
        "asana.$": "$.asana",
      }),
      resultPath: "$.approvalResult",
      taskTimeout: sfn.Timeout.duration(cdk.Duration.days(7)),
    });

    const finalizeApprovedEmail = new tasks.LambdaInvoke(this, "FinalizeApprovedEmail", {
      lambdaFunction: finalizeApprovedEmailFunction,
      payload: sfn.TaskInput.fromObject({
        "requestId.$": "$.requestId",
        "sender.$": "$.sender",
        "receiver.$": "$.receiver",
        "approver.$": "$.approver",
        "preparedEmail.$": "$.preparedEmail",
        "asana.$": "$.asana",
        "approvalResult.$": "$.approvalResult",
      }),
      outputPath: "$.Payload",
    });

    const rejected = new sfn.Fail(this, "RejectedByNonApprover", {
      error: "NonApproverCompletion",
      cause: "An Asana user other than the configured approver completed the approval task.",
    });

    const timedOut = new sfn.Fail(this, "ApprovalTimedOut", {
      error: "ApprovalTimedOut",
      cause: "The approval task was not completed before the workflow timed out.",
    });

    createApprovalAndWait.addCatch(rejected, {
      errors: ["NonApproverCompletion"],
      resultPath: "$.failure",
    });
    createApprovalAndWait.addCatch(timedOut, {
      errors: ["States.Timeout"],
      resultPath: "$.failure",
    });

    const stateMachine = new sfn.StateMachine(this, "DisputeEmailApprovalStateMachine", {
      definitionBody: sfn.DefinitionBody.fromChainable(
        createApprovalAndWait.next(finalizeApprovedEmail),
      ),
      stateMachineType: sfn.StateMachineType.STANDARD,
      tracingEnabled: true,
      logs: {
        destination: new logs.LogGroup(this, "StateMachineLogs", {
          retention: logs.RetentionDays.THREE_MONTHS,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
        level: sfn.LogLevel.ALL,
      },
    });

    startWorkflowFunction.addEnvironment("STATE_MACHINE_ARN", stateMachine.stateMachineArn);
    stateMachine.grantStartExecution(startWorkflowFunction);
    stateMachine.grantTaskResponse(asanaWebhookFunction);

    const httpApi = new apigwv2.HttpApi(this, "DisputeEmailRuntimeApi", {
      apiName: "dispute-email-runtime-agent",
    });
    httpApi.addRoutes({
      path: "/email-requests",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        "StartEmailWorkflowIntegration",
        startWorkflowFunction,
      ),
    });
    httpApi.addRoutes({
      path: "/asana-webhook",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        "AsanaApprovalWebhookIntegration",
        asanaWebhookFunction,
      ),
    });

    cdk.Tags.of(this).add("project_name", "dispute-email-runtime-agent");
    cdk.Tags.of(this).add("owner_agent", "ash");
    cdk.Tags.of(this).add("workflow_agent", "machamp");

    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "AsanaWebhookUrl", {
      value: `${httpApi.apiEndpoint}/asana-webhook`,
    });
    new cdk.CfnOutput(this, "StateMachineArn", { value: stateMachine.stateMachineArn });
  }

  private nodeFunction(
    id: string,
    props: Omit<nodejs.NodejsFunctionProps, "runtime" | "architecture" | "logGroup">,
  ): nodejs.NodejsFunction {
    return new nodejs.NodejsFunction(this, id, {
      ...props,
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      logGroup: new logs.LogGroup(this, `${id}LogGroup`, {
        retention: logs.RetentionDays.THREE_MONTHS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: "node24",
        mainFields: ["module", "main"],
        sourceMap: true,
      },
    });
  }
}
