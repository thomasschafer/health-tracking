import type { BackupKindStatus, BackupStatus } from "../shared/backup.ts";
import { BACKUP_KIND_LABELS } from "../shared/backup.ts";
import { formatAgo } from "./format.ts";
import type { PendingSession } from "./local-store.ts";

export type NoticeAction =
  | { kind: "link"; label: string; to: string }
  | { kind: "export"; label: string }
  | { kind: "update"; label: string };

export type NoticeIcon = "alert" | "unsynced" | "download" | "update" | "backup";

export interface Notice {
  /** Stable across refreshes, so a snooze keeps applying to the same notice. */
  id: string;
  /**
   * Critical notices are pinned to the top of every screen until fixed: they're about data that
   * could be lost. Reminders wait in the notification centre.
   */
  level: "critical" | "reminder";
  icon: NoticeIcon;
  title: string;
  body: string | null;
  action: NoticeAction | null;
  snoozable: boolean;
}

export interface NoticeInput {
  pending: readonly PendingSession[];
  loadError: string | null;
  backupStatus: BackupStatus | null;
  updateAvailable: boolean;
}

function backupFailure(kind: "replica" | "export", status: BackupKindStatus): Notice | null {
  const label = BACKUP_KIND_LABELS[kind];
  const failure = (body: string): Notice => ({
    id: `backup-${kind}-failing`,
    level: "critical",
    icon: "alert",
    title: `${label} needs attention`,
    body,
    action: { kind: "link", label: "Details", to: "/settings#backups" },
    snoozable: false,
  });
  switch (status.state) {
    case "ok":
    case "not-configured":
      return null;
    case "failing":
      return failure(`Its last check failed ${formatAgo(status.checkedAt)}.`);
    case "stale":
      return failure(
        status.lastOkAt === null
          ? "It hasn't been verified yet."
          : `It was last verified ${formatAgo(status.lastOkAt)}.`,
      );
  }
}

export function buildNotices({
  pending,
  loadError,
  backupStatus,
  updateAvailable,
}: NoticeInput): Notice[] {
  const notices: Notice[] = [];
  const rejected = pending.filter((p) => p.rejection !== null).length;
  const waiting = pending.length - rejected;

  if (rejected > 0) {
    notices.push({
      id: "rejected",
      level: "critical",
      icon: "alert",
      title: `${rejected === 1 ? "1 reading was" : `${String(rejected)} readings were`} rejected by the server`,
      body: `${rejected === 1 ? "It's" : "They're"} only on this phone.`,
      action: { kind: "link", label: "Review", to: "/settings" },
      snoozable: false,
    });
  }
  if (waiting > 0) {
    notices.push({
      id: "unsynced",
      level: "critical",
      icon: "unsynced",
      title: `${waiting === 1 ? "1 reading is" : `${String(waiting)} readings are`} saved on this phone only`,
      body: "They'll sync when the laptop is reachable.",
      action: null,
      snoozable: false,
    });
  }
  if (loadError !== null) {
    notices.push({
      id: "load-error",
      level: "critical",
      icon: "alert",
      title: "Something went wrong loading data",
      body: loadError,
      action: null,
      snoozable: false,
    });
  }

  if (backupStatus !== null) {
    const { replica, export: driveExport, manualExport } = backupStatus;
    for (const notice of [
      backupFailure("replica", replica),
      backupFailure("export", driveExport),
    ]) {
      if (notice !== null) notices.push(notice);
    }
    if (replica.state === "not-configured") {
      notices.push({
        id: "replica-not-configured",
        level: "reminder",
        icon: "backup",
        title: "Cloud backup isn't set up",
        body: "Until it is, your data only exists on the laptop.",
        action: { kind: "link", label: "Details", to: "/settings#backups" },
        snoozable: false,
      });
    }
    if (manualExport.due) {
      notices.push({
        id: "manual-export",
        level: "reminder",
        icon: "download",
        title:
          manualExport.lastExportedAt === null
            ? "Save a copy of your data"
            : "Time to save a fresh copy",
        body:
          manualExport.lastExportedAt === null
            ? "Keep a copy somewhere safe, such as Google Drive."
            : `Your last export was ${formatAgo(manualExport.lastExportedAt)}.`,
        action: { kind: "export", label: "Export now" },
        snoozable: true,
      });
    }
  }

  if (updateAvailable) {
    notices.push({
      id: "update",
      level: "reminder",
      icon: "update",
      title: "An update is ready",
      body: "It installs automatically next time you open the app.",
      action: { kind: "update", label: "Update now" },
      snoozable: false,
    });
  }
  return notices;
}
