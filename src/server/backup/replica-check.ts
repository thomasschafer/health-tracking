import Database from "better-sqlite3";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Db } from "../db/index.ts";
import { backupCanary } from "../db/schema.ts";

const execFileAsync = promisify(execFile);

/** Tables whose content must survive a restore. Bookkeeping tables are excluded. */
const DATA_TABLES = {
  bp_sessions: "id",
  bp_readings: "session_id, position",
  settings: "key",
} as const;

/** A stable fingerprint of all user data, used to compare a restored replica with the live database. */
export function dataChecksum(client: Database.Database): string {
  const hash = createHash("sha256");
  for (const [table, orderBy] of Object.entries(DATA_TABLES)) {
    hash.update(`table:${table}\n`);
    for (const row of client.prepare(`select * from ${table} order by ${orderBy}`).iterate()) {
      hash.update(`${JSON.stringify(row)}\n`);
    }
  }
  return hash.digest("hex");
}

export interface ReplicaCheckOptions {
  db: Db;
  databasePath: string;
  litestreamBin: string;
  litestreamConfig: string;
  /** How long to wait for the canary write to reach the replica. */
  timeoutMs: number;
  pollIntervalMs: number;
}

export type CheckResult = { ok: true; detail: string } | { ok: false; detail: string };

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function restoreTo(options: ReplicaCheckOptions, outputPath: string): Promise<void> {
  await execFileAsync(
    options.litestreamBin,
    ["restore", "-config", options.litestreamConfig, "-o", outputPath, options.databasePath],
    { timeout: 120_000 },
  );
}

/**
 * Proves the replica is restorable and current: writes a random canary, waits until a fresh
 * restore contains it, then checks the restore passes an integrity check and holds the same
 * data as the live database did when the canary was written.
 */
export async function checkReplica(options: ReplicaCheckOptions): Promise<CheckResult> {
  const { db } = options;
  const nonce = randomUUID();
  const expected = db.$client.transaction(() => {
    db.insert(backupCanary)
      .values({ id: 1, nonce, writtenAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: backupCanary.id,
        set: { nonce, writtenAt: new Date().toISOString() },
      })
      .run();
    return dataChecksum(db.$client);
  })();

  const workDir = mkdtempSync(join(tmpdir(), "health-replica-check-"));
  try {
    const deadline = Date.now() + options.timeoutMs;
    let attempt = 0;
    let lastProblem = "no restore attempted";
    while (Date.now() < deadline) {
      attempt++;
      const outputPath = join(workDir, `restore-${String(attempt)}.db`);
      try {
        await restoreTo(options, outputPath);
      } catch (err) {
        lastProblem = `litestream restore failed: ${err instanceof Error ? err.message : String(err)}`;
        await sleep(options.pollIntervalMs);
        continue;
      }
      const restored = new Database(outputPath, { readonly: true });
      try {
        const integrity: unknown = restored.pragma("integrity_check", { simple: true });
        if (integrity !== "ok") {
          return {
            ok: false,
            detail: `Restored database failed its integrity check: ${String(integrity)}`,
          };
        }
        const canary = restored.prepare("select nonce from backup_canary where id = 1").get() as
          { nonce: string } | undefined;
        if (canary?.nonce !== nonce) {
          lastProblem = "the replica hasn't caught up with the latest write";
          await sleep(options.pollIntervalMs);
          continue;
        }
        const actual = dataChecksum(restored);
        // Writes made after the canary may also have replicated, so the live data is acceptable too.
        if (actual === expected || actual === dataChecksum(db.$client)) {
          const sessions = restored.prepare("select count(*) as n from bp_sessions").get() as {
            n: number;
          };
          return {
            ok: true,
            detail: `Restored ${String(sessions.n)} sessions; data matches the live database.`,
          };
        }
        lastProblem = "restored data doesn't match the live database";
      } finally {
        restored.close();
      }
      await sleep(options.pollIntervalMs);
    }
    return {
      ok: false,
      detail: `Gave up after ${String(attempt)} restore attempts: ${lastProblem}.`,
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
