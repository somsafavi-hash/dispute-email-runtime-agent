# Arceus discovery

The soofi-xyz team kit was cloned from:

```text
https://github.com/soofi-xyz/soofi-xyz-team-kit
```

Cursor plugin installation guidance from the kit:

```bash
mkdir -p ~/.cursor/plugins/local
git clone https://github.com/soofi-xyz/cursor-plugin.git ~/.cursor/plugins/local/soofi-xyz
```

In this environment the plugin was installed from the team-kit repository into:

```text
~/.cursor/plugins/local/soofi-xyz
```

## Existing agents discovered

The kit README lists these project agents:

`abra`, `alakazam`, `arceus`, `ash`, `audino`, `braviary`, `castform`, `chatot`, `conkeldurr`, `delibird`, `ditto`, `eevee`, `espeon`, `wigglytuff`, `hoothoot`, `klefki`, `lucario`, `machamp`, `meowth`, `metagross`, `noctowl`, `oracle`, `oranguru`, `pelipper`, `porygon`, `regigigas`, `smeargle`, `sylveon`, `xatu`.

## Arceus routing result

Task read:

Build a runtime workflow that prepares a dispute email from sender, receiver, approver, and email body; creates an Asana task in the Bush project assigned to the approver; and deploys on AWS instead of Vercel.

Primary recommendation:

- `ash`: best fit for the Asana/Lambda runtime ownership and deployment boundary.

Supporting skills:

- `apply-engineering-guidelines`: baseline SOCAPITAL engineering standards.
- `build-ai-agents`: relevant for Lambda-friendly Asana runtime boundaries, even though this repo intentionally does not create a new chatbot agent.

Secondary agent:

- `machamp`: owns the Step Functions workflow, wait-for-task-token approval shape, idempotency, retry, and timeout behavior.

Invocation hint used as implementation direction:

```text
/ash Build an AWS Lambda runtime for dispute email preparation and Asana approval; use /machamp for the Step Functions wait-for-task-token approval workflow.
```

## Design decision

No new Pokemon agent was created. The existing `ash` and `machamp` agents were used as ownership boundaries for this standalone runtime workflow.

## CI/CD routing result

Task read:

Add a CI/CD pipeline to this AWS TypeScript/CDK runtime repository.

Primary recommendation:

- No additional implementation agent is needed for this narrow task. Use the `integrate-ci-cd` skill directly.

Supporting skills:

- `apply-engineering-guidelines`: baseline SOCAPITAL engineering standards for testing, AWS/CDK, and deployment.
- `integrate-ci-cd`: adds the required `justfile` recipes and GitHub Actions caller workflows.

Invocation hint used as implementation direction:

```text
/arceus Add CI/CD to this AWS CDK TypeScript repo.
```
