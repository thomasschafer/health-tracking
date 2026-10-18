import { CloudOff, Download, RefreshCw, TriangleAlert, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { BACKUP_KIND_LABELS, type BackupKindStatus } from "../../shared/backup.ts";
import { useData } from "../data.tsx";
import { formatAgo } from "../format.ts";
import { useExport } from "./ExportProvider.tsx";
import { useUpdate } from "./UpdateProvider.tsx";

type Tone = "critical" | "warning" | "info";

function Notice({ tone, icon, children }: { tone: Tone; icon: ReactNode; children: ReactNode }) {
  return (
    <div className={`notice ${tone}`}>
      <span className="notice-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="notice-text">{children}</span>
    </div>
  );
}

function backupProblem(status: BackupKindStatus): { tone: Tone; text: string } | null {
  switch (status.state) {
    case "ok":
      return null;
    case "not-configured":
      return { tone: "warning", text: "isn't set up yet" };
    case "failing":
      return { tone: "critical", text: `failed its last check (${formatAgo(status.checkedAt)})` };
    case "stale":
      return {
        tone: "critical",
        text:
          status.lastOkAt === null
            ? "hasn't been verified yet"
            : `was last verified ${formatAgo(status.lastOkAt)}`,
      };
  }
}

/**
 * Problems that need attention. None of these can be dismissed: each stays until the underlying
 * issue is fixed, so unsynced readings or broken backups can't go unnoticed.
 */
export function StatusStrip() {
  const { pending, connection, cachedAt, backupStatus, loadError } = useData();
  const { updateAvailable, applyUpdate } = useUpdate();
  const openExport = useExport();
  const rejected = pending.filter((p) => p.rejection !== null).length;
  const waiting = pending.length - rejected;

  const notices: ReactNode[] = [];
  if (rejected > 0) {
    notices.push(
      <Notice key="rejected" tone="critical" icon={<TriangleAlert size={16} />}>
        {rejected === 1 ? "1 reading was" : `${String(rejected)} readings were`} rejected by the
        server and {rejected === 1 ? "is" : "are"} only on this phone.{" "}
        <Link to="/settings">Review</Link>
      </Notice>,
    );
  }
  if (waiting > 0) {
    notices.push(
      <Notice key="waiting" tone="warning" icon={<CloudOff size={16} />}>
        {waiting === 1 ? "1 reading is" : `${String(waiting)} readings are`} saved on this phone
        only. They'll sync when the laptop is reachable.
      </Notice>,
    );
  }
  if (connection === "offline") {
    notices.push(
      <Notice key="offline" tone="info" icon={<WifiOff size={16} />}>
        Can't reach the laptop{cachedAt !== null && `. Showing data from ${formatAgo(cachedAt)}`}.
      </Notice>,
    );
  }
  if (loadError !== null) {
    notices.push(
      <Notice key="error" tone="critical" icon={<TriangleAlert size={16} />}>
        Something went wrong loading data: {loadError}
      </Notice>,
    );
  }
  if (backupStatus !== null) {
    const { replica, export: driveExport, manualExport } = backupStatus;
    if (replica.state === "not-configured") {
      notices.push(
        <Notice key="replica-setup" tone="warning" icon={<TriangleAlert size={16} />}>
          Cloud backup isn't set up yet, so your data only exists on the laptop.{" "}
          <Link to="/settings#backups">Details</Link>
        </Notice>,
      );
    }
    // The automatic Drive export is optional, so it only raises problems once it is set up.
    for (const [kind, status] of [
      ["replica", replica],
      ["export", driveExport],
    ] as const) {
      const problem = status.state === "not-configured" ? null : backupProblem(status);
      if (problem !== null) {
        notices.push(
          <Notice key={kind} tone={problem.tone} icon={<TriangleAlert size={16} />}>
            {BACKUP_KIND_LABELS[kind]} {problem.text}. <Link to="/settings#backups">Details</Link>
          </Notice>,
        );
      }
    }
    if (manualExport.due) {
      notices.push(
        <Notice key="manual-export" tone="info" icon={<Download size={16} />}>
          {manualExport.lastExportedAt === null
            ? "Save a copy of your data somewhere safe, such as Google Drive."
            : `Your last export was ${formatAgo(manualExport.lastExportedAt)}. Time to save a fresh copy.`}{" "}
          <button type="button" className="link-button" onClick={openExport}>
            Export now
          </button>
        </Notice>,
      );
    }
  }
  if (updateAvailable) {
    notices.push(
      <Notice key="update" tone="info" icon={<RefreshCw size={16} />}>
        A new version is ready.{" "}
        <button type="button" className="link-button" onClick={applyUpdate}>
          Update now
        </button>
      </Notice>,
    );
  }

  if (notices.length === 0) return null;
  return (
    <div className="status-strip" role="status">
      {notices}
    </div>
  );
}
