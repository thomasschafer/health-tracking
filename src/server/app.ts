import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z, ZodError } from "zod";
import { bpSessionInputSchema, sessionDayKey } from "../shared/bp.ts";
import { settingsSchema } from "../shared/settings.ts";
import { localDateKey } from "../shared/time.ts";
import type { BackupStatus } from "../shared/backup.ts";
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  restoreSession,
  updateSession,
} from "./bp-repo.ts";
import type { Db } from "./db/index.ts";
import { ConflictError, NotFoundError } from "./errors.ts";
import { recordManualExport } from "./backup-status.ts";
import { exportJson } from "./backup/json-export.ts";
import { sessionsToCsv } from "./export.ts";
import { getSettings, saveSettings } from "./settings-repo.ts";

export interface AppDeps {
  db: Db;
  now: () => Date;
  backupStatus: () => BackupStatus;
  allowedTailscaleLogin: string | null;
  /** Directory containing the built client, or null to serve the API only. */
  clientDir: string | null;
}

const dateKeySchema = z.iso.date();

async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Request body must be valid JSON" });
  }
}

export function createApp(deps: AppDeps): Hono {
  const { db, now } = deps;
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
    if (err instanceof ConflictError) return c.json({ error: err.message }, 409);
    if (err instanceof ZodError)
      return c.json({ error: "Invalid request", issues: err.issues }, 400);
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  const api = new Hono();

  api.get("/health", (c) => c.json({ ok: true }));

  // Tailscale Serve sets this header for requests from the tailnet. Checking it means a request
  // that reaches the port some other way (e.g. another local process) can't read health data.
  api.use("*", async (c, next) => {
    const allowed = deps.allowedTailscaleLogin;
    if (allowed !== null && c.req.header("Tailscale-User-Login") !== allowed) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
    return undefined;
  });

  api.get("/bp/sessions", (c) => c.json({ sessions: listSessions(db) }));

  api.get("/bp/sessions/:id", (c) => c.json({ session: getSession(db, c.req.param("id")) }));

  api.post("/bp/sessions", async (c) => {
    const input = bpSessionInputSchema.parse(await jsonBody(c));
    const result = createSession(db, input, now());
    return c.json({ session: result.session }, result.kind === "created" ? 201 : 200);
  });

  api.put("/bp/sessions/:id", async (c) => {
    const id = c.req.param("id");
    const body = await jsonBody(c);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new HTTPException(400, { message: "Request body must be an object" });
    }
    const input = bpSessionInputSchema.parse({ ...body, id });
    const { id: _id, ...content } = input;
    return c.json({ session: updateSession(db, id, content, now()) });
  });

  api.delete("/bp/sessions/:id", (c) => {
    deleteSession(db, c.req.param("id"), now());
    return c.body(null, 204);
  });

  api.post("/bp/sessions/:id/restore", (c) =>
    c.json({ session: restoreSession(db, c.req.param("id"), now()) }),
  );

  api.get("/bp/export.csv", (c) => {
    const from = c.req.query("from");
    const to = c.req.query("to");
    const fromKey = from === undefined ? null : dateKeySchema.parse(from);
    const toKey = to === undefined ? null : dateKeySchema.parse(to);
    const sessions = listSessions(db).filter((s) => {
      const key = sessionDayKey(new Date(s.takenAt));
      return (fromKey === null || key >= fromKey) && (toKey === null || key <= toKey);
    });
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header(
      "Content-Disposition",
      `attachment; filename="blood-pressure-${fromKey ?? "start"}-to-${toKey ?? "now"}.csv"`,
    );
    return c.body(sessionsToCsv(sessions));
  });

  // A lossless copy of all data, which scripts/restore-from-export.ts can rebuild a database from.
  api.get("/export.json", (c) => {
    const exportedAt = now();
    c.header(
      "Content-Disposition",
      `attachment; filename="health-export-${localDateKey(exportedAt)}.json"`,
    );
    return c.json(exportJson(db, exportedAt));
  });

  // Called by the app once the user has saved an export somewhere, to track when to remind them.
  api.post("/manual-exports", (c) => {
    recordManualExport(db, now());
    return c.json({ status: deps.backupStatus() }, 201);
  });

  api.get("/settings", (c) => c.json({ settings: getSettings(db) }));

  api.put("/settings", async (c) => {
    const next = settingsSchema.parse(await jsonBody(c));
    return c.json({ settings: saveSettings(db, next) });
  });

  api.get("/backup-status", (c) => c.json({ status: deps.backupStatus() }));

  api.all("*", (c) => c.json({ error: "Not found" }, 404));

  app.route("/api", api);

  const clientDir = deps.clientDir;
  if (clientDir !== null) {
    const indexPath = join(clientDir, "index.html");
    if (!existsSync(indexPath)) {
      throw new Error(`Client build not found at ${indexPath}. Run "npm run build" first.`);
    }
    app.use(
      "*",
      serveStatic({
        root: clientDir,
        onFound: (path, c) => {
          // Hashed assets never change; everything else must be revalidated so updates ship.
          c.header(
            "Cache-Control",
            path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
          );
        },
      }),
    );
    // Client-side routes all render the app shell.
    app.get(
      "*",
      serveStatic({
        path: indexPath,
        onFound: (_, c) => {
          c.header("Cache-Control", "no-cache");
        },
      }),
    );
  }

  return app;
}
