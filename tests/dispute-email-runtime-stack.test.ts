import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";

import { DisputeEmailRuntimeStack } from "../lib/dispute-email-runtime-stack.js";

describe("DisputeEmailRuntimeStack", () => {
  it("synthesizes an AWS-native approval workflow", () => {
    const app = new cdk.App();
    const stack = new DisputeEmailRuntimeStack(app, "TestStack", {
      env: { region: "us-east-2" },
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::Lambda::Function", 4);
    template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
    template.resourceCountIs("AWS::DynamoDB::Table", 1);
    template.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      TimeToLiveSpecification: {
        AttributeName: "expiresAt",
        Enabled: true,
      },
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
    });
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs24.x",
      Architectures: ["arm64"],
      TracingConfig: {
        Mode: "Active",
      },
    });

    const stateMachines = template.findResources(
      "AWS::StepFunctions::StateMachine",
    );
    const definition = JSON.stringify(Object.values(stateMachines)[0]);
    expect(definition).toContain("CreateAsanaApprovalAndWait");
    expect(definition).toContain("lambda:invoke.waitForTaskToken");
    expect(definition).toContain("FinalizeApprovedEmail");
  });
});
