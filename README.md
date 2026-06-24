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
  "sender": {
    "email": "saman.safavi@elephant-labs.xyz",
    "name": "Saman Safavi"
  },
  "receiver": { "email": "receiver@example.com" },
  "approver": {
    "email": "saman.safavi@elephant-labs.xyz",
    "name": "Saman Safavi"
  },
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
npm run format
npm run build
npm test
npm run lint
npm run synth
npm run ci
```

## CI/CD

Arceus routed CI/CD integration to the `integrate-ci-cd` skill. This repo uses local GitHub Actions workflows so it does not depend on cross-repository reusable workflow access:

- `.github/workflows/ci-cd-dev.yml` runs on `feature/**` and `cursor/**` branch pushes, plus pull requests to `main`.
- `.github/workflows/ci-cd-prod.yml` runs on pushes to `main`.

The workflows run the same checks as the root `justfile` recipes:

- `setup`
- `format`
- `lint`
- `type-check`
- `test`
- `build`
- `deploy`

Configure these GitHub repository variables before enabling deployments:

| Variable                       | Used by | Description                                               |
| ------------------------------ | ------- | --------------------------------------------------------- |
| `AWS_REGION`                   | Both    | Optional AWS region override; defaults to `us-east-2`     |
| `DEV_AWS_ROLE_ARN`             | DEV     | AWS OIDC role ARN for development deploys                 |
| `DEV_ASANA_BUSH_PROJECT_GID`   | DEV     | Bush project gid for development deploys                  |
| `DEV_ASANA_WORKSPACE_GID`      | DEV     | Optional workspace gid for development identity lookup    |
| `DEV_ASANA_PAT_SECRET_NAME`    | DEV     | Secrets Manager secret name for the development Asana PAT |
| `DEV_CDK_BOOTSTRAP_QUALIFIER`  | DEV     | Optional CDK bootstrap qualifier                          |
| `PROD_AWS_ROLE_ARN`            | PROD    | AWS OIDC role ARN for production deploys                  |
| `PROD_ASANA_BUSH_PROJECT_GID`  | PROD    | Bush project gid for production deploys                   |
| `PROD_ASANA_WORKSPACE_GID`     | PROD    | Optional workspace gid for production identity lookup     |
| `PROD_ASANA_PAT_SECRET_NAME`   | PROD    | Secrets Manager secret name for the production Asana PAT  |
| `PROD_CDK_BOOTSTRAP_QUALIFIER` | PROD    | Optional CDK bootstrap qualifier                          |

The AWS OIDC roles must trust this repository and allow CDK to deploy the stack resources for each environment.

## Notes for operators

- The approver for v1 should be Saman Safavi.
- The approver must be a member of or otherwise have access to the Bush Asana project.
- The Asana PAT must belong to an Asana user/bot with permission to create tasks in the Bush project and read task completion details.
- Do not log or commit Asana PATs, task tokens, AWS account IDs, or customer PII.
