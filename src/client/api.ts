import { z } from "zod";
import { backupStatusSchema, type BackupStatus } from "../shared/backup.ts";
import { bpSessionSchema, type BpSession, type BpSessionInput } from "../shared/bp.ts";
import { settingsResponseSchema, type Settings } from "../shared/settings.ts";

const REQUEST_TIMEOUT_MS = 8_000;

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

/** Sends a request and returns the response, turning failures into ApiError or UnreachableError. */
async function send(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    // Without a timeout, requests to a sleeping laptop can hang for a long time before failing.
    res = await fetch(`/api${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
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
  return res;
}

async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const res = await send(path, init);
  return schema.parse(res.status === 204 ? undefined : await res.json());
}

/** Fetches a file's contents verbatim, for exports that are saved rather than parsed. */
async function requestText(path: string): Promise<string> {
  return (await send(path)).text();
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
      z.object({ settings: settingsResponseSchema }).transform((r) => r.settings),
    ),
  saveSettings: (settings: Settings): Promise<Settings> =>
    request(
      "/settings",
      z.object({ settings: settingsResponseSchema }).transform((r) => r.settings),
      {
        method: "PUT",
        body: JSON.stringify(settings),
      },
    ),
  exportJson: (): Promise<string> => requestText("/export.json"),
  exportCsv: (): Promise<string> => requestText("/bp/export.csv"),
  recordManualExport: (): Promise<BackupStatus> =>
    request(
      "/manual-exports",
      z.object({ status: backupStatusSchema }).transform((r) => r.status),
      {
        method: "POST",
      },
    ),
  backupStatus: (): Promise<BackupStatus> =>
    request(
      "/backup-status",
      z.object({ status: backupStatusSchema }).transform((r) => r.status),
    ),
};
