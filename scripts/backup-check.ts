import { runBackupChecks } from "../src/server/backup/run-checks.ts";
import { loadConfig } from "../src/server/config.ts";
import { openDatabase } from "../src/server/db/index.ts";

// Runs the backup checks immediately, e.g. after setting up credentials. The results are recorded
// just like the scheduled checks, so the app's banners update too.
const config = loadConfig(process.env);
if (config.litestream === null && config.google === null) {
  console.error("No backups are configured. See docs/operations.md.");
  process.exit(1);
}
const db = openDatabase(config.databasePath);
const results = await runBackupChecks(db, config);
db.$client.close();
let failed = false;
for (const [kind, result] of Object.entries(results)) {
  console.log(`${kind}: ${result.ok ? "ok" : "FAILED"}: ${result.detail}`);
  failed ||= !result.ok;
}
process.exit(failed ? 1 : 0);
