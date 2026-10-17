import { z } from "zod";
import { backupStatusSchema, type BackupStatus } from "../shared/backup.ts";
import { bpSessionSchema, type BpSession, type BpSessionInput } from "../shared/bp.ts";
import { settingsSchema, type Settings } from "../shared/settings.ts";

/** The server answered, but with an error. */
export class ApiError extends Error {
  override name = "ApiError";
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** The server couldn't be reached at all (e.g. the laptop is asleep). */
export class UnreachableError extends Error {
  override name = "UnreachableError";
}

const errorBodySchema = z.object({
  error: z.string(),
  issues: z.array(z.object({ message: z.string() })).optional(),
});

async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch (err) {
    throw new UnreachableError("Can't reach the server", { cause: err });
  }
  if (!res.ok) {
    const parsed = errorBodySchema.safeParse(await res.json().catch(() => null));
    const message = parsed.success
      ? [parsed.data.error, ...(parsed.data.issues ?? []).map((i) => i.message)].join(": ")
      : `Request failed with status ${String(res.status)}`;
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) {
    return schema.parse(undefined);
  }
  return schema.parse(await res.json());
}

const sessionResponse = z.object({ session: bpSessionSchema }).transform((r) => r.session);

export const api = {
  listSessions: (): Promise<BpSession[]> =>
    request(
      "/bp/sessions",
      z.object({ sessions: z.array(bpSessionSchema) }).transform((r) => r.sessions),
    ),
  createSession: (input: BpSessionInput): Promise<BpSession> =>
    request("/bp/sessions", sessionResponse, { method: "POST", body: JSON.stringify(input) }),
  updateSession: ({ id, ...content }: BpSessionInput): Promise<BpSession> =>
    request(`/bp/sessions/${id}`, sessionResponse, {
      method: "PUT",
      body: JSON.stringify(content),
    }),
  deleteSession: (id: string): Promise<void> =>
    request(`/bp/sessions/${id}`, z.undefined(), { method: "DELETE" }),
  restoreSession: (id: string): Promise<BpSession> =>
    request(`/bp/sessions/${id}/restore`, sessionResponse, { method: "POST" }),
  getSettings: (): Promise<Settings> =>
    request(
      "/settings",
      z.object({ settings: settingsSchema }).transform((r) => r.settings),
    ),
  saveSettings: (settings: Settings): Promise<Settings> =>
    request(
      "/settings",
      z.object({ settings: settingsSchema }).transform((r) => r.settings),
      {
        method: "PUT",
        body: JSON.stringify(settings),
      },
    ),
  backupStatus: (): Promise<BackupStatus> =>
    request(
      "/backup-status",
      z.object({ status: backupStatusSchema }).transform((r) => r.status),
    ),
};
