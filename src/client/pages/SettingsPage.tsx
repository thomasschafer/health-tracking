import {
  CloudCheck,
  CloudOff,
  Download,
  HardDrive,
  Info,
  ListOrdered,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { BACKUP_KIND_LABELS, BACKUP_KINDS, type BackupKindStatus } from "../../shared/backup.ts";
import { averageReadings, MAX_READINGS_PER_SESSION } from "../../shared/bp.ts";
import { REST_TIMER_OPTIONS } from "../../shared/settings.ts";
import { formatDate, formatTime } from "../../shared/time.ts";
import { useData } from "../data.tsx";
import { formatAgo, formatBp } from "../format.ts";
import { List, ListRow } from "../ui/List.tsx";
import { Page, Section } from "../ui/Page.tsx";
import { Segmented } from "../ui/Segmented.tsx";
import { ConfirmSheet } from "../ui/Sheet.tsx";

function describeBackup(status: BackupKindStatus): { text: string; ok: boolean } {
  switch (status.state) {
    case "not-configured":
      return { text: "Not set up yet", ok: false };
    case "ok":
      return { text: `Verified ${formatAgo(status.checkedAt)}`, ok: true };
    case "failing":
      return { text: `Check failed ${formatAgo(status.checkedAt)}: ${status.detail}`, ok: false };
    case "stale":
      return {
        text:
          status.lastOkAt === null
            ? "Never verified"
            : `Not verified since ${formatAgo(status.lastOkAt)}`,
        ok: false,
      };
  }
}

const icon = (Icon: typeof Timer, color: string) => (
  <span className="category-icon" style={{ background: color }}>
    <Icon size={16} color="white" aria-hidden="true" />
  </span>
);

export function SettingsPage() {
  const {
    settings,
    saveSettings,
    backupStatus,
    pending,
    retryPending,
    discardPending,
    connection,
    sessions,
  } = useData();
  const [error, setError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<string | null>(null);
  const offline = connection !== "online";

  const run = (action: () => Promise<void>) => {
    setError(null);
    action().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  };

  return (
    <Page title="Settings">
      {error !== null && <p className="entry-error">{error}</p>}

      <Section
        title="Blood pressure"
        footer={
          offline
            ? "Settings can be changed when the laptop is reachable."
            : "A short rest between readings makes them more consistent. You can still add or remove readings while entering a session."
        }
      >
        <List>
          <div className="list-row stacked">
            <span className="list-row-top">
              {icon(ListOrdered, "var(--bp)")}
              <span className="list-title" id="readings-label">
                Readings per session
              </span>
            </span>
            <Segmented
              label="Readings per session"
              options={Array.from({ length: MAX_READINGS_PER_SESSION }, (_, i) => ({
                value: i + 1,
                label: String(i + 1),
              }))}
              value={settings.readingsPerSession}
              disabled={offline}
              onChange={(n) => {
                run(() => saveSettings({ ...settings, readingsPerSession: n }));
              }}
            />
          </div>
          <div className="list-row stacked">
            <span className="list-row-top">
              {icon(Timer, "var(--bp)")}
              <span className="list-title">Rest between readings</span>
            </span>
            <Segmented
              label="Rest between readings"
              options={REST_TIMER_OPTIONS.map((s) => ({
                value: s,
                label: s === 0 ? "Off" : `${String(s)}s`,
              }))}
              value={settings.restTimerSeconds}
              disabled={offline}
              onChange={(s) => {
                run(() => saveSettings({ ...settings, restTimerSeconds: s }));
              }}
            />
          </div>
        </List>
      </Section>

      {pending.length > 0 && (
        <Section title="Waiting to sync">
          <List>
            {pending.map((p) => {
              const takenAt = new Date(p.input.takenAt);
              return p.rejection === null ? (
                <ListRow
                  key={p.input.id}
                  icon={icon(CloudOff, "var(--status-warning)")}
                  title={formatBp(averageReadings(p.input.readings))}
                  detail={`${formatDate(takenAt)}, ${formatTime(takenAt)} · waiting for the laptop`}
                />
              ) : (
                <div key={p.input.id} className="list-row stacked">
                  <span className="list-row-top">
                    {icon(TriangleAlert, "var(--status-critical)")}
                    <span className="list-text">
                      <span className="list-title">
                        {formatBp(averageReadings(p.input.readings))}
                      </span>
                      <span className="list-detail">
                        {formatDate(takenAt)}, {formatTime(takenAt)} · rejected: {p.rejection}
                      </span>
                    </span>
                  </span>
                  <span className="row-actions">
                    <button
                      type="button"
                      className="button small"
                      onClick={() => {
                        run(() => retryPending(p.input.id));
                      }}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      className="button small destructive-text"
                      onClick={() => {
                        setDiscarding(p.input.id);
                      }}
                    >
                      Discard
                    </button>
                  </span>
                </div>
              );
            })}
          </List>
        </Section>
      )}

      <Section
        title="Data"
        footer="Backups are checked every day by restoring them and comparing against your data."
      >
        <List>
          <span id="backups" />
          {backupStatus === null ? (
            <ListRow
              icon={icon(CloudOff, "var(--text-3)")}
              title="Backups"
              detail="Status unavailable while the laptop is unreachable"
            />
          ) : (
            BACKUP_KINDS.map((kind) => {
              const { text, ok } = describeBackup(backupStatus[kind]);
              return (
                <ListRow
                  key={kind}
                  icon={icon(
                    ok ? CloudCheck : TriangleAlert,
                    ok ? "var(--status-good)" : "var(--status-warning)",
                  )}
                  title={BACKUP_KIND_LABELS[kind]}
                  detail={text}
                />
              );
            })
          )}
          <ListRow
            icon={icon(Download, "var(--text-3)")}
            title="Export blood pressure"
            detail="CSV of every reading, for a spreadsheet or your GP"
            href="/api/bp/export.csv"
          />
          <ListRow
            icon={icon(HardDrive, "var(--text-3)")}
            title="Stored on your laptop"
            detail={`${String(sessions.length)} blood pressure sessions`}
          />
        </List>
      </Section>

      <Section title="About">
        <List>
          <ListRow
            icon={icon(Info, "var(--text-3)")}
            title="Version"
            value={<span className="tabular">{__APP_VERSION__}</span>}
          />
        </List>
      </Section>

      <ConfirmSheet
        open={discarding !== null}
        title="Discard this reading?"
        message="It only exists on this device, so it will be gone for good."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          const id = discarding;
          setDiscarding(null);
          if (id !== null) run(() => discardPending(id));
        }}
        onCancel={() => {
          setDiscarding(null);
        }}
      />
    </Page>
  );
}
