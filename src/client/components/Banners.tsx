import { Link } from "react-router";
import { BACKUP_KIND_LABELS, BACKUP_KINDS, type BackupKindStatus } from "../../shared/backup.ts";
import { useData } from "../data.tsx";
import { formatAgo } from "../format.ts";

function backupProblem(
  status: BackupKindStatus,
): { severity: "critical" | "warning"; text: string } | null {
  switch (status.state) {
    case "ok":
      return null;
    case "not-configured":
      return { severity: "warning", text: "isn't set up yet" };
    case "failing":
      return { severity: "critical", text: `check failed ${formatAgo(status.checkedAt)}` };
    case "stale":
      return {
        severity: "critical",
        text:
          status.lastOkAt === null
            ? "hasn't been verified yet"
            : `last verified ${formatAgo(status.lastOkAt)}`,
      };
  }
}

/** Warnings that stay visible until the underlying problem is fixed; they can't be dismissed. */
export function Banners() {
  const { pending, connection, cachedAt, backupStatus, loadError } = useData();
  const rejected = pending.filter((p) => p.rejection !== null);
  const waiting = pending.length - rejected.length;

  return (
    <div className="banners" role="status">
      {rejected.length > 0 && (
        <div className="banner critical">
          <span className="icon">!</span>
          <span>
            {rejected.length === 1 ? "1 reading was" : `${String(rejected.length)} readings were`}{" "}
            rejected by the server and {rejected.length === 1 ? "is" : "are"} only on this device.{" "}
            <Link to="/settings#sync">Review</Link>
          </span>
        </div>
      )}
      {waiting > 0 && (
        <div className="banner critical">
          <span className="icon">!</span>
          <span>
            {waiting === 1 ? "1 reading hasn't" : `${String(waiting)} readings haven't`} synced yet
            and {waiting === 1 ? "is" : "are"} only saved on this device. They'll sync when the
            laptop is reachable.
          </span>
        </div>
      )}
      {connection === "offline" && (
        <div className="banner warning">
          <span className="icon">⚠</span>
          <span>
            Can't reach the laptop.
            {cachedAt !== null && ` Showing data from ${formatAgo(cachedAt)}.`} New readings will be
            saved on this device.
          </span>
        </div>
      )}
      {loadError !== null && (
        <div className="banner critical">
          <span className="icon">!</span>
          <span>Something went wrong loading data: {loadError}</span>
        </div>
      )}
      {backupStatus !== null &&
        BACKUP_KINDS.map((kind) => {
          const problem = backupProblem(backupStatus[kind]);
          return (
            problem !== null && (
              <div key={kind} className={`banner ${problem.severity}`}>
                <span className="icon">{problem.severity === "critical" ? "!" : "⚠"}</span>
                <span>
                  {BACKUP_KIND_LABELS[kind]} {problem.text}.{" "}
                  <Link to="/settings#backups">Details</Link>
                </span>
              </div>
            )
          );
        })}
    </div>
  );
}
