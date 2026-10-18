import { CloudCheck, Plus } from "lucide-react";
import { Link } from "react-router";
import { useData } from "../data.tsx";
import { formatAgo } from "../format.ts";
import { CATEGORIES } from "../categories/registry.tsx";
import { NotificationCentre } from "../shell/NotificationCentre.tsx";
import { Page, Section } from "../ui/Page.tsx";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/London",
});

function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Europe/London",
    }).format(now),
  );
  if (hour >= 4 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Reassurance that everything is backed up, shown only when nothing needs attention. */
function BackupFooter() {
  const { backupStatus } = useData();
  if (backupStatus === null) return null;
  const { replica, export: driveExport, manualExport } = backupStatus;
  if (replica.state !== "ok" || manualExport.due) return null;
  if (driveExport.state !== "ok" && driveExport.state !== "not-configured") return null;
  return (
    <Link to="/settings#backups" className="backup-footer">
      <CloudCheck size={16} aria-hidden="true" />
      Backed up and verified {formatAgo(replica.checkedAt)}
    </Link>
  );
}

export function SummaryPage() {
  const now = new Date();
  const primary = CATEGORIES[0];
  return (
    <Page
      title="Summary"
      subtitle={`${greeting(now)} · ${dateFormat.format(now)}`}
      action={
        <div className="header-actions">
          <NotificationCentre />
          {primary !== undefined && (
            <Link
              to={primary.newEntryPath}
              className="round-button bp"
              aria-label={`New ${primary.name.toLowerCase()} reading`}
              viewTransition
            >
              <Plus size={24} strokeWidth={2.4} aria-hidden="true" />
            </Link>
          )}
        </div>
      }
    >
      <div className="summary-cards">
        {CATEGORIES.map(({ id, SummaryCard }) => (
          <SummaryCard key={id} />
        ))}
      </div>
      <Section title="Highlights">
        <div className="insights">
          {CATEGORIES.map(({ id, Highlights }) => (
            <Highlights key={id} />
          ))}
        </div>
      </Section>
      <BackupFooter />
    </Page>
  );
}
