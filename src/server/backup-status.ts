import { desc, eq } from "drizzle-orm";
import {
  BACKUP_STALE_AFTER_HOURS,
  type BackupKind,
  type BackupKindStatus,
  type BackupStatus,
} from "../shared/backup.ts";
import type { Queryable } from "./db/index.ts";
import { backupChecks } from "./db/schema.ts";

export function recordBackupCheck(
  db: Queryable,
  kind: BackupKind,
  checkedAt: Date,
  result: { ok: true; detail: string } | { ok: false; detail: string },
): void {
  db.insert(backupChecks)
    .values({ kind, checkedAt: checkedAt.toISOString(), ok: result.ok, detail: result.detail })
    .run();
}

function kindStatus(
  db: Queryable,
  kind: BackupKind,
  configured: boolean,
  now: Date,
): BackupKindStatus {
  if (!configured) {
    return { state: "not-configured" };
  }
  const latest = db
    .select()
    .from(backupChecks)
    .where(eq(backupChecks.kind, kind))
    .orderBy(desc(backupChecks.checkedAt), desc(backupChecks.id))
    .get();
  if (latest !== undefined && !latest.ok) {
    return { state: "failing", checkedAt: latest.checkedAt, detail: latest.detail };
  }
  const ageHours =
    latest === undefined
      ? Infinity
      : (now.getTime() - new Date(latest.checkedAt).getTime()) / 3_600_000;
  if (latest === undefined || ageHours > BACKUP_STALE_AFTER_HOURS) {
    return { state: "stale", lastOkAt: latest?.checkedAt ?? null };
  }
  return { state: "ok", checkedAt: latest.checkedAt };
}

export function backupStatus(
  db: Queryable,
  configured: Record<BackupKind, boolean>,
  now: Date,
): BackupStatus {
  return {
    replica: kindStatus(db, "replica", configured.replica, now),
    export: kindStatus(db, "export", configured.export, now),
  };
}
