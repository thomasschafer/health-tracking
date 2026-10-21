// Copies a snapshot of your real database into the development data directory, so development
// can use realistic data without touching the real one (`npm run dev:seed`). Copies from
// HEALTH_DATA_DIR, with the same default as the server.
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "../src/server/config.ts";
import { DEV_DATA_DIR } from "./dev.ts";

const source = loadConfig(process.env).databasePath;
const target = join(DEV_DATA_DIR, "health.db");
if (resolve(source) === resolve(target)) {
  console.error(`HEALTH_DATA_DIR is the development data directory; nothing to copy.`);
  process.exit(1);
}
if (!existsSync(source)) {
  console.error(`No database at ${source}. Set HEALTH_DATA_DIR to copy one from elsewhere.`);
  process.exit(1);
}
if (existsSync(target)) {
  console.error(`${target} already exists. Delete ${DEV_DATA_DIR} to seed it again.`);
  process.exit(1);
}
mkdirSync(DEV_DATA_DIR, { recursive: true, mode: 0o700 });
// The backup API takes a consistent snapshot, even while the real server is writing.
const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  await db.backup(target);
} finally {
  db.close();
}
console.log(`Copied ${source} to ${target}`);
