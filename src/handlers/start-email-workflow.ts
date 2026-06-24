import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import { ZodError } from "zod";

import { prepareEmailRequestSchema } from "../contracts/email-workflow.js";
import { metrics, logger } from "../observability/powertools.js";
import { loadStartWorkflowConfig } from "../services/config.js";
import { buildWorkflowInput, executionNameForRequestId } from "../services/email.js";
import { StepFunctionsService } from "../services/step-functions.js";

const stepFunctions = new StepFunctionsService();

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const config = loadStartWorkflowConfig();
    const request = prepareEmailRequestSchema.parse(parseJsonBody(event.body));
    const workflowInput = buildWorkflowInput(request, config.asanaProjectGid);
    const executionName = executionNameForRequestId(
      workflowInput.requestId,
      config.executionNamePrefix,
    );

    const execution = await stepFunctions.startExecution({
      stateMachineArn: config.stateMachineArn,
      name: executionName,
      payload: workflowInput,
    });

    metrics.addMetric("EmailWorkflowStarted", MetricUnit.Count, 1);
    logger.info("Started dispute email workflow", {
      requestId: workflowInput.requestId,
      executionName,
      status: execution.status,
    });

    return jsonResponse(execution.status === "already_started" ? 202 : 201, {
      requestId: workflowInput.requestId,
      executionArn: execution.executionArn,
      executionName,
      status: execution.status,
      preparedEmail: workflowInput.preparedEmail,
    });
  } catch (error) {
    metrics.addMetric("EmailWorkflowStartFailed", MetricUnit.Count, 1);
    return errorResponse(error);
  } finally {
    metrics.publishStoredMetrics();
  }
}

function parseJsonBody(body: string | undefined): unknown {
  if (!body) {
    return {};
  }
  return JSON.parse(body);
}

function errorResponse(error: unknown): APIGatewayProxyStructuredResultV2 {
  if (error instanceof ZodError) {
    return jsonResponse(400, {
      error: "invalid_request",
      message: "Request failed validation",
      issues: error.issues,
    });
  }

  logger.error("Unable to start dispute email workflow", { error });
  return jsonResponse(500, {
    error: "workflow_start_failed",
    message: "Unable to start dispute email workflow",
  });
}

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
