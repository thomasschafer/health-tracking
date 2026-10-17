import { existsSync, readFileSync } from "node:fs";
import { importJson } from "../src/server/backup/json-export.ts";
import { openDatabase } from "../src/server/db/index.ts";

// Rebuilds a database from a JSON export downloaded from Google Drive.
const [exportPath, databasePath] = process.argv.slice(2);
if (exportPath === undefined || databasePath === undefined) {
  console.error(
    "Usage: node scripts/restore-from-export.ts <health-export.json> <new-database-path>",
  );
  process.exit(2);
}
if (existsSync(databasePath)) {
  console.error(
    `${databasePath} already exists. Restore into a new path, then move it into place.`,
  );
  process.exit(1);
}
const db = openDatabase(databasePath);
importJson(db, JSON.parse(readFileSync(exportPath, "utf8")));
const { n } = db.$client
  .prepare("select count(*) as n from bp_sessions where deleted_at is null")
  .get() as {
  n: number;
};
db.$client.close();
console.log(`Restored ${String(n)} sessions into ${databasePath}`);
