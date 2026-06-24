import { MetricUnit } from "@aws-lambda-powertools/metrics";
import { z } from "zod";

import { workflowInputSchema } from "../contracts/email-workflow.js";
import { logger, metrics } from "../observability/powertools.js";

const eventSchema = workflowInputSchema.extend({
  approvalResult: z.object({
    approved: z.literal(true),
    taskGid: z.string(),
    approvedAt: z.string(),
  }),
});

export async function handler(event: unknown) {
  try {
    const input = eventSchema.parse(event);
    metrics.addMetric("PreparedEmailApproved", MetricUnit.Count, 1);
    logger.info("Prepared dispute email approved", {
      requestId: input.requestId,
      taskGid: input.approvalResult.taskGid,
    });

    return {
      requestId: input.requestId,
      status: "approved",
      taskGid: input.approvalResult.taskGid,
      approvedAt: input.approvalResult.approvedAt,
      preparedEmail: input.preparedEmail,
    };
  } finally {
    metrics.publishStoredMetrics();
  }
}
