import type { BackupKind } from "../../shared/backup.ts";
import { recordBackupCheck } from "../backup-status.ts";
import type { Config } from "../config.ts";
import type { Db } from "../db/index.ts";
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

/** Runs every configured backup check, records the results and returns them. */
export async function runBackupChecks(
  db: Db,
  config: Config,
): Promise<Partial<Record<BackupKind, CheckResult>>> {
  const results: Partial<Record<BackupKind, CheckResult>> = {};
  const { litestream, google } = config;
  if (litestream !== null) {
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
  if (google !== null) {
    results.export = await guarded(() => runExport(db, driveTarget(google), new Date()));
    recordBackupCheck(db, "export", new Date(), results.export);
  }
  return results;
}

/** Runs checks shortly after start-up and then on a fixed interval, never overlapping. */
export function scheduleBackupChecks(db: Db, config: Config): () => void {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    runBackupChecks(db, config)
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
  const interval = setInterval(run, config.backupCheckIntervalHours * 3_600_000);
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}
