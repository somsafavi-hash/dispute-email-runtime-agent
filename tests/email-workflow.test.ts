import { describe, expect, it } from "vitest";

import { prepareEmailRequestSchema } from "../src/contracts/email-workflow.js";
import { buildWorkflowInput, executionNameForRequestId } from "../src/services/email.js";

describe("email workflow contract", () => {
  it("accepts sender, receiver, approver, and email body", () => {
    const request = prepareEmailRequestSchema.parse({
      requestId: "Bush/email/001",
      sender: { email: "Saman.Safavi@elephant-labs.xyz", name: "Saman Safavi" },
      receiver: { email: "gthomas@springoakscapital.com", name: "Greg Thomas" },
      approver: { email: "saman.safavi@elephant-labs.xyz", name: "Saman Safavi" },
      emailBody: "Please approve this dispute email.",
    });

    expect(request.sender.email).toBe("saman.safavi@elephant-labs.xyz");
    expect(request.subject).toBe("Dispute email draft approval");
  });

  it("prepares a normalized plain-text email and workflow input", () => {
    const workflowInput = buildWorkflowInput(
      prepareEmailRequestSchema.parse({
        requestId: "Bush/email/001",
        sender: { email: "saman.safavi@elephant-labs.xyz" },
        receiver: { email: "receiver@example.com" },
        approver: { email: "saman.safavi@elephant-labs.xyz" },
        subject: " Document request ",
        emailBody: "Line one\r\nLine two",
      }),
      "bush-project-gid",
    );

    expect(workflowInput).toMatchObject({
      requestId: "Bush/email/001",
      preparedEmail: {
        from: "saman.safavi@elephant-labs.xyz",
        to: "receiver@example.com",
        subject: "Document request",
        body: "Line one\nLine two",
        contentType: "text/plain; charset=utf-8",
      },
      asana: {
        projectGid: "bush-project-gid",
      },
    });
  });

  it("builds deterministic Step Functions execution names from request ids", () => {
    const first = executionNameForRequestId("Bush/email/001");
    const second = executionNameForRequestId("Bush/email/001");

    expect(first).toBe(second);
    expect(first).toMatch(/^dispute-email-Bush-email-001-[a-f0-9]{12}$/);
  });
});
