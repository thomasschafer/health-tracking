import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.ts";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/** Either the database or an open transaction on it. */
export type Queryable = BaseSQLiteDatabase<"sync", Database.RunResult, typeof schema>;

const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

/** Opens (creating if needed) the database at `path` and applies any pending migrations. */
export function openDatabase(path: string): Db {
  const client = new Database(path);
  // WAL is required for Litestream replication.
  const mode: unknown = client.pragma("journal_mode = WAL", { simple: true });
  if (path !== ":memory:" && mode !== "wal") {
    throw new Error(`Could not enable WAL mode for ${path} (got ${String(mode)})`);
  }
  client.pragma("foreign_keys = ON");
  client.pragma("busy_timeout = 5000");
  client.pragma("synchronous = NORMAL");
  const db = drizzle({ client, schema });
  migrate(db, { migrationsFolder });
  return db;
}
