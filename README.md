# Dispute Email Runtime Agent

AWS-native runtime for preparing dispute email drafts and gating them on an Asana approval task in the Bush project.

This is a new standalone repository scaffolded from the soofi-xyz team-kit guidance. It does not depend on the earlier Next.js/Vercel `dispute-email-agent` app.

## Agent routing

Arceus discovery from `soofi-xyz-team-kit` routes this work to:

- Primary owner: `ash` - Asana/Lambda runtime ownership.
- Workflow owner: `machamp` - Step Functions workflow design.
- Baseline skill: `apply-engineering-guidelines` - TypeScript, AWS/CDK, observability, tests.

See [`docs/arceus-discovery.md`](docs/arceus-discovery.md) for the discovery evidence and existing-agent roster summary.

## Runtime behavior

`POST /email-requests` accepts:

```json
{
  "requestId": "Bush/email/001",
  "sender": { "email": "saman.safavi@elephant-labs.xyz", "name": "Saman Safavi" },
  "receiver": { "email": "receiver@example.com" },
  "approver": { "email": "saman.safavi@elephant-labs.xyz", "name": "Saman Safavi" },
  "subject": "Document request",
  "emailBody": "Plain-text email body to approve."
}
```

The runtime:

1. Validates sender, receiver, approver, subject, and email body.
2. Prepares a normalized plain-text email draft.
3. Starts one idempotent Standard Step Functions execution named from `requestId`.
4. Creates an Asana task in the configured Bush project and assigns it to the approver.
5. Validates the approver has access to the Bush project before task creation completes.
6. Waits for Asana task completion through a Step Functions task-token callback.
7. Completes only when the configured approver completes the task.

This service prepares and approves the email draft. It intentionally does not send email.

## AWS resources

The CDK stack creates:

- HTTP API:
  - `POST /email-requests`
  - `POST /asana-webhook`
- Lambda functions:
  - `StartEmailWorkflowFunction`
  - `CreateAsanaApprovalTaskFunction`
  - `AsanaApprovalWebhookFunction`
  - `FinalizeApprovedEmailFunction`
- Step Functions Standard state machine with `lambda:invoke.waitForTaskToken`
- DynamoDB approval token table with TTL and point-in-time recovery
- CloudWatch log groups and X-Ray tracing
- Secrets Manager reference for the Asana PAT

## Configuration

Create the Asana PAT secret before deployment:

```bash
aws secretsmanager create-secret \
  --name dispute-email-runtime/asana-pat \
  --secret-string "$ASANA_PAT" \
  --region us-east-2
```

Deploy with:

```bash
npm ci
npm run ci
npm run cdk deploy -- \
  --parameters AsanaBushProjectGid=<bush-project-gid> \
  --parameters AsanaWorkspaceGid=<workspace-gid-if-used> \
  --parameters AsanaPatSecretName=dispute-email-runtime/asana-pat
```

After deploy, register the `AsanaWebhookUrl` output as the Asana webhook target for the Bush project or approval task event source.

## Development

```bash
npm run build
npm test
npm run lint
npm run synth
npm run ci
```

## Notes for operators

- The approver for v1 should be Saman Safavi.
- The approver must be a member of or otherwise have access to the Bush Asana project.
- The Asana PAT must belong to an Asana user/bot with permission to create tasks in the Bush project and read task completion details.
- Do not log or commit Asana PATs, task tokens, AWS account IDs, or customer PII.
