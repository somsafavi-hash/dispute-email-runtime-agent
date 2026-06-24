import { MetricUnit } from "@aws-lambda-powertools/metrics";

import { createApprovalTaskEventSchema } from "../contracts/email-workflow.js";
import { logger, metrics } from "../observability/powertools.js";
import { AsanaClient } from "../services/asana.js";
import { ApprovalTokenStore } from "../services/approval-token-store.js";
import { loadApprovalWorkerConfig } from "../services/config.js";

export async function handler(event: unknown) {
  try {
    const config = await loadApprovalWorkerConfig();
    const input = createApprovalTaskEventSchema.parse(event);
    const asana = new AsanaClient(config.asanaAccessToken, config.asanaWorkspaceGid);
    const tokenStore = new ApprovalTokenStore(config.approvalTableName);

    const approver = await asana.resolveUser(input.approver);
    await asana.assertProjectAccess(approver, input.asana.projectGid);

    const task = await asana.createApprovalTask({
      requestId: input.requestId,
      projectGid: input.asana.projectGid,
      approver,
      sender: input.sender,
      receiver: input.receiver,
      preparedEmail: input.preparedEmail,
    });

    await tokenStore.put({
      requestId: input.requestId,
      taskGid: task.gid,
      taskToken: input.taskToken,
      approver,
    });

    metrics.addMetric("AsanaApprovalTaskCreated", MetricUnit.Count, 1);
    logger.info("Created Asana approval task", {
      requestId: input.requestId,
      taskGid: task.gid,
      taskUrl: task.permalink_url,
    });

    return {
      requestId: input.requestId,
      taskGid: task.gid,
      taskUrl: task.permalink_url,
      approver,
    };
  } catch (error) {
    metrics.addMetric("AsanaApprovalTaskCreateFailed", MetricUnit.Count, 1);
    logger.error("Failed to create Asana approval task", { error });
    throw error;
  } finally {
    metrics.publishStoredMetrics();
  }
}
