import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());
const nonEmptyString = z.string().trim().min(1);

export const identitySchema = z.object({
  email: emailSchema,
  name: nonEmptyString.optional(),
  asanaGid: z.string().trim().regex(/^\d+$/).optional(),
});

export const prepareEmailRequestSchema = z.object({
  requestId: z.string().trim().min(1).max(256).optional(),
  sender: identitySchema,
  receiver: identitySchema,
  approver: identitySchema,
  subject: z
    .string()
    .trim()
    .min(1)
    .max(998)
    .default("Dispute email draft approval"),
  emailBody: z.string().trim().min(1).max(100_000),
});

export const preparedEmailSchema = z.object({
  from: emailSchema,
  to: emailSchema,
  subject: z.string().trim().min(1).max(998),
  body: z.string().trim().min(1).max(100_000),
  contentType: z.literal("text/plain; charset=utf-8"),
});

export const workflowInputSchema = z.object({
  requestId: z.string().trim().min(1).max(256),
  sender: identitySchema,
  receiver: identitySchema,
  approver: identitySchema,
  preparedEmail: preparedEmailSchema,
  asana: z.object({
    projectGid: z.string().trim().min(1),
  }),
});

export const createApprovalTaskEventSchema = workflowInputSchema.extend({
  taskToken: z.string().trim().min(1),
});

export const approvalLookupSchema = z.object({
  requestId: z.string().trim().min(1),
  taskGid: z.string().trim().min(1),
  taskToken: z.string().trim().min(1),
  approver: identitySchema,
});

export const asanaWebhookPayloadSchema = z.object({
  events: z
    .array(
      z.object({
        action: z.string().optional(),
        resource: z
          .object({
            gid: z.string().optional(),
            resource_type: z.string().optional(),
          })
          .optional(),
        user: identitySchema
          .partial()
          .extend({
            gid: z.string().optional(),
          })
          .optional(),
      }),
    )
    .default([]),
});

export type Identity = z.infer<typeof identitySchema>;
export type PrepareEmailRequest = z.infer<typeof prepareEmailRequestSchema>;
export type PreparedEmail = z.infer<typeof preparedEmailSchema>;
export type WorkflowInput = z.infer<typeof workflowInputSchema>;
export type CreateApprovalTaskEvent = z.infer<
  typeof createApprovalTaskEventSchema
>;
export type ApprovalLookup = z.infer<typeof approvalLookupSchema>;
export type AsanaWebhookPayload = z.infer<typeof asanaWebhookPayloadSchema>;

export interface StartWorkflowResult {
  requestId: string;
  executionArn?: string;
  executionName: string;
  status: "started" | "already_started";
  preparedEmail: PreparedEmail;
}
