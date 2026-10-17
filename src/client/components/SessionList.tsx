import { Link } from "react-router";
import { averageReadings, periodOf, sessionDayKey } from "../../shared/bp.ts";
import { formatDate, formatTime } from "../../shared/time.ts";
import type { DisplaySession } from "../data.tsx";
import { formatBp } from "../format.ts";

/** Sessions grouped by day, most recent first. Expects `sessions` sorted oldest first. */
export function SessionList({ sessions }: { sessions: readonly DisplaySession[] }) {
  const newestFirst = [...sessions].reverse();
  const days = Map.groupBy(newestFirst, (s) => sessionDayKey(new Date(s.takenAt)));
  if (newestFirst.length === 0) {
    return <p className="muted">No readings yet.</p>;
  }
  return (
    <div>
      {[...days.entries()].map(([day, daySessions]) => (
        <section className="day" key={day} aria-label={day}>
          <div className="day-title">{formatDate(new Date(`${day}T12:00:00Z`))}</div>
          {daySessions.map((s) => {
            const takenAt = new Date(s.takenAt);
            const avg = averageReadings(s.readings);
            return (
              <Link className="session-link" to={`/bp/${s.id}`} key={s.id}>
                <span>
                  <span className="main">{formatBp(avg)}</span>
                  {avg.heartRate !== null && (
                    <span className="secondary small"> · pulse {Math.round(avg.heartRate)}</span>
                  )}
                  {s.note !== null && (
                    <span className="muted small" style={{ display: "block" }}>
                      {s.note}
                    </span>
                  )}
                </span>
                <span className="row" style={{ justifyContent: "flex-end", flex: "none" }}>
                  {s.pending && <span className="badge unsynced">⚠ Not synced</span>}
                  <span className="secondary small tabular">
                    {periodOf(takenAt) === "morning" ? "AM" : "PM"} {formatTime(takenAt)}
                  </span>
                </span>
              </Link>
            );
          })}
        </section>
      ))}
    </div>
  );
}
