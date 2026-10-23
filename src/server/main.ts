import { serve } from "@hono/node-server";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { backupStatus } from "./backup-status.ts";
import { scheduleBackupChecks } from "./backup/run-checks.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db/index.ts";
import { ownerLogin } from "./tailscale.ts";

const config = loadConfig(process.env);
mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
const db = openDatabase(config.databasePath);

async function allowedLogin(): Promise<string | null> {
  if (config.auth === "none") return null;
  try {
    return await ownerLogin();
  } catch (err) {
    throw new Error(
      "Couldn't find the Tailscale login this machine is signed in as, the only one the server " +
        "accepts. Is Tailscale running and logged in? For development, HEALTH_AUTH=none accepts " +
        "any request.",
      { cause: err },
    );
  }
}
const allowedTailscaleLogin = await allowedLogin();

const app = createApp({
  db,
  now: () => new Date(),
  backupStatus: () =>
    backupStatus(
      db,
      { replica: config.litestream !== null, export: config.google !== null },
      new Date(),
    ),
  allowedTailscaleLogin,
  clientDir: fileURLToPath(new URL("../../dist/client", import.meta.url)),
});

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(
    `Listening on http://${info.address}:${String(info.port)}, data in ${config.dataDir}, ` +
      (allowedTailscaleLogin === null
        ? "accepting any request"
        : `only accepting ${allowedTailscaleLogin}`),
  );
});

const stopBackupChecks = scheduleBackupChecks(db, config);

function shutdown(): void {
  stopBackupChecks();
  server.close();
  db.$client.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
