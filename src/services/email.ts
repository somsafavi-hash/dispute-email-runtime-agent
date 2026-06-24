import { createHash, randomUUID } from "node:crypto";

import type {
  PreparedEmail,
  PrepareEmailRequest,
  WorkflowInput,
} from "../contracts/email-workflow.js";

export function prepareEmail(request: PrepareEmailRequest): PreparedEmail {
  return {
    from: request.sender.email,
    to: request.receiver.email,
    subject: normalizePlainText(request.subject),
    body: normalizePlainText(request.emailBody),
    contentType: "text/plain; charset=utf-8",
  };
}

export function buildWorkflowInput(request: PrepareEmailRequest, asanaProjectGid: string): WorkflowInput {
  const requestId = request.requestId ?? randomUUID();
  return {
    requestId,
    sender: request.sender,
    receiver: request.receiver,
    approver: request.approver,
    preparedEmail: prepareEmail(request),
    asana: {
      projectGid: asanaProjectGid,
    },
  };
}

export function executionNameForRequestId(requestId: string, prefix = "dispute-email-"): string {
  const hash = createHash("sha256").update(requestId).digest("hex").slice(0, 12);
  const safeRequestId = requestId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 52);
  return `${prefix}${safeRequestId}-${hash}`.slice(0, 80);
}

function normalizePlainText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}
