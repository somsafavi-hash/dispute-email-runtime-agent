# Runtime workflow

## Input contract

Source: HTTP API request body.

Format: JSON.

Expected volume: one email approval request per execution.

Cadence: on demand.

Destination: Asana approval task in the Bush project; terminal workflow output contains the approved prepared email.

## Step Functions strategy

This is a small coordination workflow, so a Standard Step Functions state machine with a task-token wait is the right shape. Distributed Map and Glue are not needed because the workflow processes one email request at a time and does not perform heavy data transformation.

```text
POST /email-requests
  -> StartEmailWorkflowFunction
  -> DisputeEmailApprovalStateMachine
       CreateAsanaApprovalAndWait (Lambda invoke waitForTaskToken)
         -> creates Asana task in Bush project
         -> stores task token by task gid in DynamoDB
         -> waits for POST /asana-webhook callback
       FinalizeApprovedEmail
         -> returns approved prepared email
```

## Idempotency

`requestId` is used to derive the Step Functions execution name. Reusing the same `requestId` returns an `already_started` response instead of creating a second approval workflow.

## Approval rules

- The approver must resolve to an Asana user.
- The approver must have access to the Bush project.
- The approval task is assigned to the approver.
- Only the configured approver can complete the Step Functions task token successfully.
- If another Asana user completes the task, the workflow fails with `NonApproverCompletion`.

## Timeout

The approval wait state times out after seven days and fails with `ApprovalTimedOut`.

## Cost gate

This is a single-request workflow with one Step Functions execution, four small Lambda functions, one DynamoDB token row, and one Asana task. The bounded per-request cost is below a manual approval threshold, so no separate cost-approval branch is included. If this expands to batch email generation, add a Machamp cost-prediction state before any per-record work.

## Observability

- Lambda functions use AWS Lambda Powertools Logger, Tracer, and Metrics.
- Lambda X-Ray tracing is active in CDK.
- Step Functions tracing and execution logs are enabled.
- Business metrics:
  - `EmailWorkflowStarted`
  - `EmailWorkflowStartFailed`
  - `AsanaApprovalTaskCreated`
  - `AsanaApprovalTaskCreateFailed`
  - `AsanaWebhookProcessed`
  - `AsanaWebhookFailed`
  - `AsanaApprovalCompleted`
  - `AsanaApprovalRejected`
  - `PreparedEmailApproved`

Before production release, register these metrics in the SOCAPITAL Lexicon and dashboard workflow.

## Verification path

1. Run `npm run ci`.
2. Deploy to a development AWS account in `us-east-2`.
3. Register the Asana webhook URL output.
4. Submit a request using Saman Safavi as approver.
5. Confirm the Asana task appears in the Bush project assigned to Saman.
6. Complete the task as Saman and confirm the Step Functions execution succeeds.
7. Replay the webhook event and confirm it is treated as `replay_ignored` or `no_pending_approval`.
8. Complete a task as a non-approver in a test run and confirm `NonApproverCompletion`.
