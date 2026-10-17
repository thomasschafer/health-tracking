import { CloudOff, Moon, Sun } from "lucide-react";
import { Link } from "react-router";
import { averageReadings, periodOf } from "../../../shared/bp.ts";
import { formatTime } from "../../../shared/time.ts";
import type { DisplaySession } from "../../data.tsx";
import { formatBp } from "../../format.ts";

export function PeriodIcon({ takenAt, size = 18 }: { takenAt: Date; size?: number }) {
  return periodOf(takenAt) === "morning" ? (
    <Sun size={size} className="period-icon morning" aria-label="Morning" />
  ) : (
    <Moon size={size} className="period-icon evening" aria-label="Evening" />
  );
}

/** A session in a list: time of day, average, pulse and note. Links to the edit screen. */
export function SessionRow({
  session,
  dateLabel,
}: {
  session: DisplaySession;
  dateLabel?: string;
}) {
  const takenAt = new Date(session.takenAt);
  const avg = averageReadings(session.readings);
  return (
    <Link to={`/bp/${session.id}`} className="session-row" viewTransition>
      <PeriodIcon takenAt={takenAt} />
      <span className="session-main">
        <span className="session-value rounded-nums">
          {formatBp(avg)}
          {avg.heartRate !== null && (
            <span className="session-pulse"> · {Math.round(avg.heartRate)} bpm</span>
          )}
        </span>
        {session.note !== null && <span className="session-note">{session.note}</span>}
      </span>
      <span className="session-meta">
        {session.pending && (
          <span className="unsynced-badge">
            <CloudOff size={13} aria-hidden="true" /> Not synced
          </span>
        )}
        <span className="session-time tabular">
          {dateLabel !== undefined && `${dateLabel}, `}
          {formatTime(takenAt)}
        </span>
      </span>
    </Link>
  );
}
