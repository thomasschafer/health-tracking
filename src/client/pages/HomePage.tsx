import { useMemo, useState } from "react";
import { Link } from "react-router";
import { summariseWindow, type PeriodSummary } from "../../shared/bp.ts";
import { addDaysToDateKey, localDateKey } from "../../shared/time.ts";
import { dailyPoints, filterFrom, withRollingAverage, type PeriodFilter } from "../chart-data.ts";
import { CategoryBadge } from "../components/CategoryBadge.tsx";
import { SessionList } from "../components/SessionList.tsx";
import { TrendChart } from "../components/TrendChart.tsx";
import { useData } from "../data.tsx";
import { formatBp } from "../format.ts";

const RANGES = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All", days: null },
] as const;
type RangeLabel = (typeof RANGES)[number]["label"];

const PERIODS: { label: string; value: PeriodFilter }[] = [
  { label: "All", value: "all" },
  { label: "AM", value: "morning" },
  { label: "PM", value: "evening" },
];

function Tile({ label, summary }: { label: string; summary: PeriodSummary }) {
  return (
    <div className="card tile">
      <div className="label">{label}</div>
      {summary.average === null ? (
        <div className="value muted">–</div>
      ) : (
        <>
          <div className="value">
            {formatBp(summary.average)} <span className="unit">mmHg</span>
          </div>
          <CategoryBadge average={summary.average} />
          <div className="muted small">
            {summary.sessionCount} session{summary.sessionCount === 1 ? "" : "s"}
            {summary.average.heartRate !== null &&
              ` · pulse ${String(Math.round(summary.average.heartRate))}`}
          </div>
        </>
      )}
    </div>
  );
}

export function HomePage() {
  const { sessions } = useData();
  const [range, setRange] = useState<RangeLabel>("90d");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const now = new Date();
  const week = summariseWindow(sessions, now, 7);
  const month = summariseWindow(sessions, now, 30);

  const trend = useMemo(() => {
    const days = RANGES.find((r) => r.label === range)?.days ?? null;
    const fromDay = days === null ? null : addDaysToDateKey(localDateKey(new Date()), -(days - 1));
    // The rolling average is computed over all data so the first points in range are complete.
    return filterFrom(withRollingAverage(dailyPoints(sessions, period)), fromDay);
  }, [sessions, range, period]);

  return (
    <div className="stack">
      <Link to="/bp/new" className="button primary big">
        New blood pressure reading
      </Link>

      <h2>Last 7 days</h2>
      <div className="tiles">
        <Tile label="Morning" summary={week.morning} />
        <Tile label="Evening" summary={week.evening} />
      </div>
      <p className="secondary small" style={{ margin: 0 }}>
        Last 30 days: morning{" "}
        {month.morning.average === null ? "–" : formatBp(month.morning.average)}, evening{" "}
        {month.evening.average === null ? "–" : formatBp(month.evening.average)}
      </p>

      <h2>Trend</h2>
      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="segmented" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                aria-pressed={range === r.label}
                onClick={() => {
                  setRange(r.label);
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Time of day">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={period === p.value}
                onClick={() => {
                  setPeriod(p.value);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {trend.length === 0 ? (
          <p className="muted">No readings in this range.</p>
        ) : (
          <TrendChart points={trend} />
        )}
      </div>

      <h2>Recent</h2>
      <div className="card">
        <SessionList sessions={sessions.slice(-6)} />
        <Link to="/bp/history">All readings</Link>
      </div>

      <p className="muted small">
        Categories use NICE home-monitoring thresholds and are meant for averages over several days.
        This isn't medical advice.
      </p>
    </div>
  );
}
