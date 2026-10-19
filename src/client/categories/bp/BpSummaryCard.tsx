import { ChevronRight, HeartPulse, Plus } from "lucide-react";
import { Link } from "react-router";
import { averageReadings, summariseWindow } from "../../../shared/bp.ts";
import { useData } from "../../data.tsx";
import { formatAgo, formatBp } from "../../format.ts";
import { PeriodIcon } from "./SessionRow.tsx";
import { StatusPill } from "./StatusPill.tsx";

const SPARK_SESSIONS = 10;

/** The last few sessions as tiny range bars from diastolic to systolic. */
function Sparkline() {
  const { sessions } = useData();
  const recent = sessions.slice(-SPARK_SESSIONS).map((s) => averageReadings(s.readings));
  if (recent.length < 2) return null;
  const min = Math.min(...recent.map((a) => a.diastolic)) - 4;
  const max = Math.max(...recent.map((a) => a.systolic)) + 4;
  const y = (v: number) => 2 + (1 - (v - min) / (max - min)) * 52;
  const step = 104 / SPARK_SESSIONS;
  const offset = (SPARK_SESSIONS - recent.length) * step;
  return (
    <svg className="sparkline" viewBox="0 0 104 56" aria-hidden="true">
      {recent.map((a, i) => (
        <rect
          key={i}
          x={offset + i * step + (step - 6) / 2}
          y={y(a.systolic)}
          width={6}
          height={Math.max(y(a.diastolic) - y(a.systolic), 6)}
          rx={3}
          opacity={0.35 + (0.65 * (i + 1)) / recent.length}
        />
      ))}
    </svg>
  );
}

export function BpSummaryCard() {
  const { sessions } = useData();
  const latest = sessions.at(-1);
  const week = summariseWindow(sessions, new Date(), 7);

  return (
    // The whole card opens the overview through a stretched link, with the Log button above it
    // so the two never nest (a link inside a link isn't valid).
    <div className="card summary-card">
      <div className="summary-card-header">
        <Link to="/bp" className="category-name bp stretched-link" viewTransition>
          <HeartPulse size={18} aria-hidden="true" />
          Blood pressure
          <ChevronRight size={16} className="summary-card-chevron" aria-hidden="true" />
        </Link>
        <Link
          to="/bp/new"
          className="log-button"
          aria-label="New blood pressure reading"
          viewTransition
        >
          <Plus size={16} strokeWidth={2.6} aria-hidden="true" />
          Log
        </Link>
      </div>
      {latest === undefined ? (
        <p className="summary-empty">No readings yet</p>
      ) : (
        <div className="summary-card-body">
          <div>
            <span className="summary-label">
              <PeriodIcon takenAt={new Date(latest.takenAt)} size={14} /> Latest ·{" "}
              {formatAgo(latest.takenAt)}
            </span>
            <span className="summary-value rounded-nums">
              {formatBp(averageReadings(latest.readings))}
              <span className="summary-unit"> mmHg</span>
            </span>
            {week.all.average !== null ? (
              <span className="summary-detail">
                7-day average <strong className="rounded-nums">{formatBp(week.all.average)}</strong>
              </span>
            ) : (
              <span className="summary-detail">No readings in the last 7 days</span>
            )}
          </div>
          <Sparkline />
        </div>
      )}
      {week.all.average !== null && (
        <div className="summary-card-footer">
          <StatusPill average={week.all.average} />
        </div>
      )}
    </div>
  );
}
