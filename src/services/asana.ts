import type { Identity, PreparedEmail } from "../contracts/email-workflow.js";

export interface AsanaUser {
  gid: string;
  name?: string;
  email?: string;
}

export interface AsanaTask {
  gid: string;
  completed: boolean;
  completed_by?: AsanaUser | null;
  permalink_url?: string;
}

interface AsanaResponse<T> {
  data: T;
}

interface AsanaPage<T> {
  data: T[];
  next_page?: {
    uri?: string;
  } | null;
}

export class AsanaError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AsanaError";
  }
}

export class AsanaClient {
  private readonly baseUrl = "https://app.asana.com/api/1.0";

  constructor(
    private readonly accessToken: string,
    private readonly workspaceGid?: string,
  ) {}

  async resolveUser(identity: Identity): Promise<Identity> {
    if (identity.asanaGid) {
      const user = await this.getUser(identity.asanaGid);
      return {
        ...identity,
        asanaGid: user.gid,
        name: identity.name ?? user.name,
        email: identity.email ?? normalizeEmail(user.email),
      };
    }

    if (!this.workspaceGid) {
      return identity;
    }

    const user = await this.findWorkspaceUserByEmail(identity.email);
    return user
      ? {
          ...identity,
          asanaGid: user.gid,
          name: identity.name ?? user.name,
        }
      : identity;
  }

  async assertProjectAccess(identity: Identity, projectGid: string): Promise<void> {
    const projectUsers = await this.listProjectUsers(projectGid);
    const normalizedEmail = normalizeEmail(identity.email);
    const hasAccess = projectUsers.some((user) => {
      const userEmail = user.email ? normalizeEmail(user.email) : undefined;
      return user.gid === identity.asanaGid || userEmail === normalizedEmail;
    });

    if (!hasAccess) {
      throw new AsanaError("Approver must have access to the configured Asana project", 403, {
        projectGid,
        approver: {
          asanaGid: identity.asanaGid,
          email: identity.email,
          name: identity.name,
        },
      });
    }
  }

  async getTask(taskGid: string): Promise<AsanaTask> {
    const response = await this.get<AsanaResponse<AsanaTask>>(
      `/tasks/${encodeURIComponent(taskGid)}`,
      {
        opt_fields: "gid,completed,completed_by.gid,completed_by.name,completed_by.email,permalink_url",
      },
    );
    return response.data;
  }

  async createApprovalTask(input: {
    requestId: string;
    projectGid: string;
    approver: Identity;
    sender: Identity;
    receiver: Identity;
    preparedEmail: PreparedEmail;
  }): Promise<AsanaTask> {
    const response = await this.post<AsanaResponse<AsanaTask>>("/tasks", {
      data: {
        name: `Approve dispute email: ${input.preparedEmail.subject}`,
        assignee: input.approver.asanaGid ?? input.approver.email,
        projects: [input.projectGid],
        completed: false,
        notes: [
          `Request: ${input.requestId}`,
          `Sender: ${input.sender.email}`,
          `Receiver: ${input.receiver.email}`,
          `Approver: ${input.approver.email}`,
          "",
          `Subject: ${input.preparedEmail.subject}`,
          "",
          input.preparedEmail.body,
        ].join("\n"),
      },
    });

    return response.data;
  }

  private async getUser(gid: string): Promise<AsanaUser> {
    const response = await this.get<AsanaResponse<AsanaUser>>(`/users/${encodeURIComponent(gid)}`, {
      opt_fields: "gid,name,email",
    });
    return response.data;
  }

  private async findWorkspaceUserByEmail(email: string): Promise<AsanaUser | undefined> {
    const users = await this.listWorkspaceUsers();
    const normalizedEmail = normalizeEmail(email);
    return users.find((user) => (user.email ? normalizeEmail(user.email) : undefined) === normalizedEmail);
  }

  private async listWorkspaceUsers(): Promise<AsanaUser[]> {
    if (!this.workspaceGid) {
      return [];
    }

    return this.getAllPages<AsanaUser>("/users", {
      workspace: this.workspaceGid,
      opt_fields: "gid,name,email",
      limit: "100",
    });
  }

  private async listProjectUsers(projectGid: string): Promise<AsanaUser[]> {
    return this.getAllPages<AsanaUser>(`/projects/${encodeURIComponent(projectGid)}/users`, {
      opt_fields: "gid,name,email",
      limit: "100",
    });
  }

  private async getAllPages<T>(path: string, query: Record<string, string>): Promise<T[]> {
    const values: T[] = [];
    let url: URL | undefined = this.buildUrl(path, query);

    while (url) {
      const page: AsanaPage<T> = await this.requestUrl<AsanaPage<T>>(url);
      values.push(...page.data);
      url = page.next_page?.uri ? new URL(page.next_page.uri) : undefined;
    }

    return values;
  }

  private async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    return this.requestUrl<T>(this.buildUrl(path, query));
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.requestUrl<T>(this.buildUrl(path), {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  private buildUrl(path: string, query: Record<string, string> = {}): URL {
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    return url;
  }

  private async requestUrl<T>(url: URL, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new AsanaError(`Asana request failed (${response.status})`, response.status, { body });
    }

    return (await response.json()) as T;
  }
}

function normalizeEmail(email: string | undefined): string {
  if (!email) {
    throw new AsanaError("Asana user does not expose an email address", 422);
  }
  return email.trim().toLowerCase();
}
