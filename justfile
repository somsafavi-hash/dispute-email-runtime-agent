set dotenv-load := false

# Install dependencies for CI runners.
setup:
    npm ci

# Check code formatting.
format:
    npm run format

# Run linting.
lint:
    npm run lint

# Run TypeScript type checking.
type-check:
    npm run build

# Run unit and synthesis tests.
test:
    npm test

# Synthesize the CDK stack.
build:
    #!/usr/bin/env bash
    set -euo pipefail
    cdk_args=(--strict)
    if [[ -n "${CDK_BOOTSTRAP_QUALIFIER:-}" ]]; then
      cdk_args+=(--context "@aws-cdk/core:bootstrapQualifier=${CDK_BOOTSTRAP_QUALIFIER}")
    fi
    npm run synth -- "${cdk_args[@]}"

# Deploy the CDK stack. ASANA_BUSH_PROJECT_GID must be configured in the GitHub environment.
deploy:
    #!/usr/bin/env bash
    set -euo pipefail
    : "${ASANA_BUSH_PROJECT_GID:?ASANA_BUSH_PROJECT_GID is required}"
    cdk_args=(
      --require-approval never
      --parameters "AsanaBushProjectGid=${ASANA_BUSH_PROJECT_GID}"
      --parameters "AsanaWorkspaceGid=${ASANA_WORKSPACE_GID:-}"
      --parameters "AsanaPatSecretName=${ASANA_PAT_SECRET_NAME:-dispute-email-runtime/asana-pat}"
    )
    if [[ -n "${CDK_BOOTSTRAP_QUALIFIER:-}" ]]; then
      cdk_args+=(--context "@aws-cdk/core:bootstrapQualifier=${CDK_BOOTSTRAP_QUALIFIER}")
    fi
    npm run cdk deploy -- "${cdk_args[@]}"
