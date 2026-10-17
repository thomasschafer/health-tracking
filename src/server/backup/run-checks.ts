import type { BackupKind } from "../../shared/backup.ts";
import { recordBackupCheck } from "../backup-status.ts";
import type { Config } from "../config.ts";
import { desc, eq } from "drizzle-orm";
import type { Db, Queryable } from "../db/index.ts";
import { backupChecks } from "../db/schema.ts";
import { driveTarget } from "./drive.ts";
import { runExport } from "./export-check.ts";
import { checkReplica, type CheckResult } from "./replica-check.ts";

const REPLICA_TIMEOUT_MS = 5 * 60_000;
const REPLICA_POLL_MS = 5_000;

async function guarded(run: () => Promise<CheckResult>): Promise<CheckResult> {
  try {
    return await run();
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Runs the configured backup checks (all of them by default), records the results and returns them. */
export async function runBackupChecks(
  db: Db,
  config: Config,
  shouldRun: (kind: BackupKind) => boolean = () => true,
): Promise<Partial<Record<BackupKind, CheckResult>>> {
  const results: Partial<Record<BackupKind, CheckResult>> = {};
  const { litestream, google } = config;
  if (litestream !== null && shouldRun("replica")) {
    results.replica = await guarded(() =>
      checkReplica({
        db,
        databasePath: config.databasePath,
        litestreamBin: litestream.bin,
        litestreamConfig: litestream.configPath,
        timeoutMs: REPLICA_TIMEOUT_MS,
        pollIntervalMs: REPLICA_POLL_MS,
      }),
    );
    recordBackupCheck(db, "replica", new Date(), results.replica);
  }
  if (google !== null && shouldRun("export")) {
    results.export = await guarded(() => runExport(db, driveTarget(google), new Date()));
    recordBackupCheck(db, "export", new Date(), results.export);
  }
  return results;
}

/** Whether a check of this kind is due, based on when it last ran (successfully or not). */
export function isCheckDue(
  db: Queryable,
  kind: BackupKind,
  intervalHours: number,
  now: Date,
): boolean {
  const latest = db
    .select({ checkedAt: backupChecks.checkedAt })
    .from(backupChecks)
    .where(eq(backupChecks.kind, kind))
    .orderBy(desc(backupChecks.checkedAt))
    .get();
  return (
    latest === undefined ||
    now.getTime() - new Date(latest.checkedAt).getTime() >= intervalHours * 3_600_000
  );
}

/**
 * Looks for due checks shortly after start-up and then hourly, never overlapping. Polling rather
 * than a single long timer means checks still happen soon after the laptop wakes from sleep.
 */
export function scheduleBackupChecks(db: Db, config: Config): () => void {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    runBackupChecks(db, config, (kind) =>
      isCheckDue(db, kind, config.backupCheckIntervalHours, new Date()),
    )
      .then((results) => {
        for (const [kind, result] of Object.entries(results)) {
          const log = result.ok ? console.log : console.error;
          log(`Backup check (${kind}): ${result.ok ? "ok" : "FAILED"}: ${result.detail}`);
        }
      })
      .catch((err: unknown) => {
        console.error("Backup checks crashed", err);
      })
      .finally(() => {
        running = false;
      });
  };
  const initial = setTimeout(run, 60_000);
  const interval = setInterval(run, 3_600_000);
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}
