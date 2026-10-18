import { desc, eq } from "drizzle-orm";
import {
  BACKUP_STALE_AFTER_HOURS,
  MANUAL_EXPORT_DUE_AFTER_DAYS,
  type ManualExportStatus,
  type BackupKind,
  type BackupKindStatus,
  type BackupStatus,
} from "../shared/backup.ts";
import type { Queryable } from "./db/index.ts";
import { backupChecks, manualExports } from "./db/schema.ts";

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

export function recordManualExport(db: Queryable, exportedAt: Date): void {
  db.insert(manualExports).values({ exportedAt: exportedAt.toISOString() }).run();
}

function manualExportStatus(db: Queryable, now: Date): ManualExportStatus {
  const latest = db
    .select({ exportedAt: manualExports.exportedAt })
    .from(manualExports)
    .orderBy(desc(manualExports.exportedAt))
    .get();
  if (latest === undefined) return { lastExportedAt: null, due: true };
  const ageDays = (now.getTime() - new Date(latest.exportedAt).getTime()) / 86_400_000;
  return { lastExportedAt: latest.exportedAt, due: ageDays > MANUAL_EXPORT_DUE_AFTER_DAYS };
}

export function backupStatus(
  db: Queryable,
  configured: Record<BackupKind, boolean>,
  now: Date,
): BackupStatus {
  return {
    replica: kindStatus(db, "replica", configured.replica, now),
    export: kindStatus(db, "export", configured.export, now),
    manualExport: manualExportStatus(db, now),
  };
}
