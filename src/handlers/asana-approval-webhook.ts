import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import { ZodError } from "zod";

import {
  asanaWebhookPayloadSchema,
  type ApprovalLookup,
} from "../contracts/email-workflow.js";
import { logger, metrics } from "../observability/powertools.js";
import { AsanaClient } from "../services/asana.js";
import { ApprovalTokenStore } from "../services/approval-token-store.js";
import { loadApprovalWorkerConfig } from "../services/config.js";
import {
  isTaskTokenReplayError,
  StepFunctionsService,
} from "../services/step-functions.js";

const stepFunctions = new StepFunctionsService();

interface ApprovalActor {
  gid?: string | undefined;
  email?: string | undefined;
  name?: string | undefined;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const hookSecret =
    event.headers["x-hook-secret"] ?? event.headers["X-Hook-Secret"];
  if (hookSecret) {
    return {
      statusCode: 200,
      headers: {
        "X-Hook-Secret": hookSecret,
      },
      body: "",
    };
  }

  try {
    const config = await loadApprovalWorkerConfig();
    const payload = asanaWebhookPayloadSchema.parse(parseJsonBody(event.body));
    const asana = new AsanaClient(
      config.asanaAccessToken,
      config.asanaWorkspaceGid,
    );
    const tokenStore = new ApprovalTokenStore(config.approvalTableName);
    const results = [];

    for (const webhookEvent of payload.events) {
      const taskGid = webhookEvent.resource?.gid;
      if (
        !taskGid ||
        webhookEvent.resource?.resource_type !== "task" ||
        !isPotentialCompletionEvent(webhookEvent.action)
      ) {
        results.push({
          taskGid,
          status: "ignored",
          reason: "not_task_completion",
        });
        continue;
      }

      const approval = await tokenStore.get(taskGid);
      if (!approval) {
        results.push({
          taskGid,
          status: "ignored",
          reason: "no_pending_approval",
        });
        continue;
      }

      const task = await asana.getTask(taskGid);
      if (!task.completed) {
        results.push({
          taskGid,
          requestId: approval.requestId,
          status: "ignored",
          reason: "not_completed",
        });
        continue;
      }

      const actor = task.completed_by ?? webhookEvent.user;
      if (!isApprover(actor, approval)) {
        results.push(await rejectNonApprover(approval, actor, tokenStore));
        continue;
      }

      results.push(await approve(approval, actor, tokenStore));
    }

    metrics.addMetric("AsanaWebhookProcessed", MetricUnit.Count, 1);
    return jsonResponse(200, { ok: true, results });
  } catch (error) {
    metrics.addMetric("AsanaWebhookFailed", MetricUnit.Count, 1);
    return errorResponse(error);
  } finally {
    metrics.publishStoredMetrics();
  }
}

function isPotentialCompletionEvent(action: string | undefined): boolean {
  return action === "changed" || action === "completed";
}

function isApprover(
  actor: ApprovalActor | undefined | null,
  approval: ApprovalLookup,
): boolean {
  if (!actor) {
    return false;
  }

  if (approval.approver.asanaGid && actor.gid === approval.approver.asanaGid) {
    return true;
  }

  return Boolean(
    approval.approver.email &&
    actor.email &&
    actor.email.trim().toLowerCase() === approval.approver.email,
  );
}

async function approve(
  approval: ApprovalLookup,
  actor: ApprovalActor | undefined | null,
  tokenStore: ApprovalTokenStore,
) {
  try {
    await stepFunctions.sendTaskSuccess(approval.taskToken, {
      approved: true,
      requestId: approval.requestId,
      taskGid: approval.taskGid,
      approvedBy: {
        asanaGid: actor?.gid,
        email: actor?.email,
        name: actor?.name,
      },
      approvedAt: new Date().toISOString(),
    });
    await tokenStore.delete(approval.taskGid);
    metrics.addMetric("AsanaApprovalCompleted", MetricUnit.Count, 1);
    return {
      taskGid: approval.taskGid,
      requestId: approval.requestId,
      status: "approved",
    };
  } catch (error) {
    if (isTaskTokenReplayError(error)) {
      await tokenStore.delete(approval.taskGid);
      return {
        taskGid: approval.taskGid,
        requestId: approval.requestId,
        status: "replay_ignored",
      };
    }
    throw error;
  }
}

async function rejectNonApprover(
  approval: ApprovalLookup,
  actor: ApprovalActor | undefined | null,
  tokenStore: ApprovalTokenStore,
) {
  try {
    await stepFunctions.sendTaskFailure(
      approval.taskToken,
      "NonApproverCompletion",
      {
        requestId: approval.requestId,
        taskGid: approval.taskGid,
        actor: actor
          ? {
              asanaGid: actor.gid,
              email: actor.email,
              name: actor.name,
            }
          : undefined,
        expectedApprover: approval.approver,
      },
    );
    await tokenStore.delete(approval.taskGid);
    metrics.addMetric("AsanaApprovalRejected", MetricUnit.Count, 1);
    return {
      taskGid: approval.taskGid,
      requestId: approval.requestId,
      status: "rejected_non_approver",
    };
  } catch (error) {
    if (isTaskTokenReplayError(error)) {
      await tokenStore.delete(approval.taskGid);
      return {
        taskGid: approval.taskGid,
        requestId: approval.requestId,
        status: "replay_ignored",
      };
    }
    throw error;
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
      error: "invalid_webhook_payload",
      message: "Webhook payload failed validation",
      issues: error.issues,
    });
  }

  logger.error("Unable to process Asana approval webhook", { error });
  return jsonResponse(500, {
    error: "asana_webhook_failed",
    message: "Unable to process Asana approval webhook",
  });
}

function jsonResponse(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
