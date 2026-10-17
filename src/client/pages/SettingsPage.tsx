import { useState } from "react";
import { BACKUP_KIND_LABELS, BACKUP_KINDS, type BackupKindStatus } from "../../shared/backup.ts";
import { MAX_READINGS_PER_SESSION } from "../../shared/bp.ts";
import { formatDate, formatTime } from "../../shared/time.ts";
import { useData } from "../data.tsx";
import { formatAgo, formatBp } from "../format.ts";
import { averageReadings } from "../../shared/bp.ts";

function describeBackup(status: BackupKindStatus): string {
  switch (status.state) {
    case "not-configured":
      return "Not set up yet.";
    case "ok":
      return `Verified ${formatAgo(status.checkedAt)}.`;
    case "failing":
      return `Last check failed ${formatAgo(status.checkedAt)}: ${status.detail}`;
    case "stale":
      return status.lastOkAt === null
        ? "Never verified."
        : `Not verified since ${formatAgo(status.lastOkAt)}.`;
  }
}

export function SettingsPage() {
  const {
    settings,
    saveSettings,
    backupStatus,
    pending,
    retryPending,
    discardPending,
    connection,
  } = useData();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<void>) => {
    setError(null);
    action().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  };

  return (
    <div className="stack">
      <h1>Settings</h1>
      {error !== null && <p className="field-error">{error}</p>}

      <h2>Blood pressure</h2>
      <div className="card stack">
        <div className="field">
          <span className="label" id="readings-label">
            Readings per session
          </span>
          <div className="segmented" role="group" aria-labelledby="readings-label">
            {Array.from({ length: MAX_READINGS_PER_SESSION }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={settings.readingsPerSession === n}
                disabled={connection !== "online"}
                onClick={() => {
                  run(() => saveSettings({ ...settings, readingsPerSession: n }));
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="muted small">
            You can still add or remove readings when entering a session.
          </span>
        </div>
      </div>

      <h2 id="sync">Unsynced readings</h2>
      <div className="card stack">
        {pending.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Everything on this device has synced.
          </p>
        ) : (
          pending.map((p) => {
            const takenAt = new Date(p.input.takenAt);
            return (
              <div key={p.input.id} className="stack" style={{ gap: 6 }}>
                <div>
                  <strong className="tabular">{formatBp(averageReadings(p.input.readings))}</strong>{" "}
                  <span className="secondary small">
                    {formatDate(takenAt)} {formatTime(takenAt)}
                  </span>
                </div>
                {p.rejection === null ? (
                  <span className="secondary small">Waiting for the laptop.</span>
                ) : (
                  <>
                    <span className="field-error">Rejected by the server: {p.rejection}</span>
                    <div className="row">
                      <button
                        type="button"
                        className="button"
                        onClick={() => {
                          run(() => retryPending(p.input.id));
                        }}
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        className="button danger"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Permanently discard this reading? It only exists on this device.",
                            )
                          ) {
                            run(() => discardPending(p.input.id));
                          }
                        }}
                      >
                        Discard
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      <h2 id="backups">Backups</h2>
      <div className="card stack">
        {backupStatus === null ? (
          <p className="muted" style={{ margin: 0 }}>
            Backup status is unavailable while the laptop can't be reached.
          </p>
        ) : (
          BACKUP_KINDS.map((kind) => (
            <div key={kind}>
              <strong>{BACKUP_KIND_LABELS[kind]}</strong>
              <div className="secondary small">{describeBackup(backupStatus[kind])}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
