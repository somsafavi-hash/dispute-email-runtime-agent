import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

import {
  approvalLookupSchema,
  type ApprovalLookup,
} from "../contracts/email-workflow.js";

const TTL_SECONDS = 7 * 24 * 60 * 60;

export class ApprovalTokenStore {
  constructor(
    private readonly tableName: string,
    private readonly client = DynamoDBDocumentClient.from(
      new DynamoDBClient({}),
    ),
  ) {}

  async put(approval: ApprovalLookup): Promise<void> {
    const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: taskKey(approval.taskGid),
          ...approval,
          expiresAt,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  }

  async get(taskGid: string): Promise<ApprovalLookup | undefined> {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: taskKey(taskGid),
        },
      }),
    );

    if (!response.Item) {
      return undefined;
    }

    return approvalLookupSchema.parse(response.Item);
  }

  async delete(taskGid: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          pk: taskKey(taskGid),
        },
      }),
    );
  }
}

function taskKey(taskGid: string): string {
  return `TASK#${taskGid}`;
}
