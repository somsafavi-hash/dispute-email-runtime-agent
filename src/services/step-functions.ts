import {
  SendTaskFailureCommand,
  SendTaskSuccessCommand,
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";

export interface StartWorkflowExecutionInput {
  stateMachineArn: string;
  name: string;
  payload: unknown;
}

export interface StartWorkflowExecutionResult {
  status: "started" | "already_started";
  executionArn?: string;
}

export class StepFunctionsService {
  constructor(private readonly client = new SFNClient({})) {}

  async startExecution(
    input: StartWorkflowExecutionInput,
  ): Promise<StartWorkflowExecutionResult> {
    try {
      const response = await this.client.send(
        new StartExecutionCommand({
          stateMachineArn: input.stateMachineArn,
          name: input.name,
          input: JSON.stringify(input.payload),
        }),
      );

      return {
        status: "started",
        ...(response.executionArn
          ? { executionArn: response.executionArn }
          : {}),
      };
    } catch (error) {
      if (errorName(error) === "ExecutionAlreadyExists") {
        return { status: "already_started" };
      }
      throw error;
    }
  }

  async sendTaskSuccess(taskToken: string, output: unknown): Promise<void> {
    await this.client.send(
      new SendTaskSuccessCommand({
        taskToken,
        output: JSON.stringify(output),
      }),
    );
  }

  async sendTaskFailure(
    taskToken: string,
    error: string,
    cause: unknown,
  ): Promise<void> {
    await this.client.send(
      new SendTaskFailureCommand({
        taskToken,
        error,
        cause: JSON.stringify(cause),
      }),
    );
  }
}

export function isTaskTokenReplayError(error: unknown): boolean {
  return ["InvalidToken", "TaskDoesNotExist", "TaskTimedOut"].includes(
    errorName(error),
  );
}

function errorName(error: unknown): string {
  return error && typeof error === "object" && "name" in error
    ? String((error as { name?: unknown }).name)
    : "";
}
