import { getSecretString } from "./secrets.js";

export interface StartWorkflowConfig {
  asanaProjectGid: string;
  stateMachineArn: string;
  executionNamePrefix: string;
}

export interface ApprovalWorkerConfig {
  asanaAccessToken: string;
  asanaWorkspaceGid?: string;
  approvalTableName: string;
}

export function loadStartWorkflowConfig(
  env: NodeJS.ProcessEnv = process.env,
): StartWorkflowConfig {
  return {
    asanaProjectGid: requiredEnv(env, "ASANA_BUSH_PROJECT_GID"),
    stateMachineArn: requiredEnv(env, "STATE_MACHINE_ARN"),
    executionNamePrefix:
      optionalEnv(env, "EXECUTION_NAME_PREFIX") ?? "dispute-email-",
  };
}

export async function loadApprovalWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ApprovalWorkerConfig> {
  const workspaceGid = optionalEnv(env, "ASANA_WORKSPACE_GID");
  return {
    asanaAccessToken: await getSecretString(
      requiredEnv(env, "ASANA_ACCESS_TOKEN_SECRET_ARN"),
    ),
    ...(workspaceGid ? { asanaWorkspaceGid: workspaceGid } : {}),
    approvalTableName: requiredEnv(env, "APPROVAL_TABLE_NAME"),
  };
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = optionalEnv(env, key);
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function optionalEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}
