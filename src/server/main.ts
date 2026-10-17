import { serve } from "@hono/node-server";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { backupStatus } from "./backup-status.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db/index.ts";

const config = loadConfig(process.env);
mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
const db = openDatabase(config.databasePath);

const app = createApp({
  db,
  now: () => new Date(),
  backupStatus: () =>
    backupStatus(
      db,
      { replica: config.litestream !== null, export: config.google !== null },
      new Date(),
    ),
  allowedTailscaleLogin: config.allowedTailscaleLogin,
  clientDir: fileURLToPath(new URL("../../dist/client", import.meta.url)),
});

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(
    `Listening on http://${info.address}:${String(info.port)}, data in ${config.dataDir}`,
  );
});

function shutdown(): void {
  server.close();
  db.$client.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
