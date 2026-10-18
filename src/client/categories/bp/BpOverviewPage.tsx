import { ChevronRight, Info, Moon, Plus, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { summariseWindow, type PeriodSummary } from "../../../shared/bp.ts";
import { localDateKey } from "../../../shared/time.ts";
import { useData } from "../../data.tsx";
import {
  formatBp,
  formatDayKey,
  formatMonthKey,
  formatRelativeDayKey,
  formatShortDayKey,
} from "../../format.ts";
import { Card } from "../../ui/Card.tsx";
import { Page, Section } from "../../ui/Page.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { InsightCard } from "./InsightCard.tsx";
import { bpInsights } from "./insights.ts";
import { RangeChart } from "./RangeChart.tsx";
import { SessionRow } from "./SessionRow.tsx";
import { StatusPill } from "./StatusPill.tsx";
import {
  buildTrend,
  RANGES,
  RANGE_LABELS,
  type Bucket,
  type BucketSize,
  type PeriodFilter,
  type RangeKey,
} from "./trend.ts";

function bucketLabel(bucket: Bucket, size: BucketSize): string {
  switch (size) {
    case "day":
      return formatDayKey(bucket.start);
    case "week":
      return `${formatShortDayKey(bucket.start)} – ${formatShortDayKey(bucket.end)}`;
    case "month":
      return formatMonthKey(bucket.start);
  }
}

function PeriodTile({
  period,
  summary,
}: {
  period: "morning" | "evening";
  summary: PeriodSummary;
}) {
  const Icon = period === "morning" ? Sun : Moon;
  return (
    <Card className="period-tile">
      <span className="tile-label">
        <Icon size={16} className={`period-icon ${period}`} aria-hidden="true" />
        {period === "morning" ? "Mornings" : "Evenings"}
      </span>
      {summary.average === null ? (
        <span className="tile-empty">No readings</span>
      ) : (
        <>
          <span className="tile-value rounded-nums">{formatBp(summary.average)}</span>
          <span className="tile-detail">
            {summary.sessionCount} session{summary.sessionCount === 1 ? "" : "s"}
            {summary.average.heartRate !== null &&
              ` · ${String(Math.round(summary.average.heartRate))} bpm`}
          </span>
        </>
      )}
    </Card>
  );
}

export function BpOverviewPage() {
  const { sessions } = useData();
  const [range, setRange] = useState<RangeKey>("M");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [selected, setSelected] = useState<Bucket | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const today = localDateKey(new Date());

  const trend = useMemo(
    () => buildTrend(sessions, range, period, today),
    [sessions, range, period, today],
  );
  const insights = useMemo(() => bpInsights(sessions, today), [sessions, today]);
  const month = summariseWindow(sessions, new Date(), 30);
  const recent = sessions.slice(-5).reverse();

  const readout = selected?.average ?? trend.average;
  const readoutLabel =
    selected !== null
      ? bucketLabel(selected, trend.bucketSize)
      : `${RANGE_LABELS[range]} average${period === "all" ? "" : `, ${period}s`}`;

  return (
    <Page
      title="Blood pressure"
      back={{ to: "/", label: "Summary" }}
      action={
        <Link
          to="/bp/new"
          className="round-button bp"
          aria-label="New blood pressure reading"
          viewTransition
        >
          <Plus size={24} strokeWidth={2.4} aria-hidden="true" />
        </Link>
      }
    >
      <Card className="chart-card">
        <Segmented
          label="Time range"
          options={RANGES.map((r) => ({ value: r, label: r }))}
          value={range}
          onChange={(r) => {
            setRange(r);
            setSelected(null);
          }}
        />
        <div className="readout" aria-live="polite">
          <span className="readout-label">{readoutLabel}</span>
          {readout === null ? (
            <span className="readout-empty">No readings</span>
          ) : (
            <span className="readout-value rounded-nums">
              {formatBp(readout)} <span className="readout-unit">mmHg</span>
            </span>
          )}
          <span className="readout-detail">
            {selected !== null
              ? `${String(selected.sessionCount)} session${selected.sessionCount === 1 ? "" : "s"}${
                  selected.average?.heartRate != null
                    ? ` · ${String(Math.round(selected.average.heartRate))} bpm`
                    : ""
                }`
              : trend.average !== null && <StatusPill average={trend.average} />}
          </span>
        </div>
        <RangeChart
          buckets={trend.buckets}
          bucketSize={trend.bucketSize}
          selected={selected}
          onSelect={setSelected}
        />
        <div className="chart-legend">
          <span className="chart-legend-key" aria-hidden="true" />
          Home monitoring thresholds, 135/85
        </div>
        <div className="chart-footer">
          <Segmented
            label="Time of day"
            options={[
              { value: "all", label: "All" },
              { value: "morning", label: "Morning" },
              { value: "evening", label: "Evening" },
            ]}
            value={period}
            onChange={(p) => {
              setPeriod(p);
              setSelected(null);
            }}
          />
          <button
            type="button"
            className="icon-button"
            onClick={() => {
              setAboutOpen(true);
            }}
            aria-label="About these ranges"
          >
            <Info size={20} aria-hidden="true" />
          </button>
        </div>
      </Card>

      <Section title="Last 30 days">
        <div className="tile-grid">
          <PeriodTile period="morning" summary={month.morning} />
          <PeriodTile period="evening" summary={month.evening} />
        </div>
      </Section>

      {insights.length > 0 && (
        <Section title="Insights">
          <div className="insights">
            {insights.map((insight) => (
              <InsightCard key={insight.kind} insight={insight} />
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Recent"
        action={
          <Link to="/bp/history" className="section-link" viewTransition>
            Show all <ChevronRight size={16} aria-hidden="true" />
          </Link>
        }
      >
        <Card className="list-card">
          {recent.length === 0 ? (
            <p className="empty">No readings yet. Tap + to add your first.</p>
          ) : (
            recent.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                dateLabel={formatRelativeDayKey(localDateKey(new Date(s.takenAt)), today)}
              />
            ))
          )}
        </Card>
      </Section>

      <Sheet
        open={aboutOpen}
        onClose={() => {
          setAboutOpen(false);
        }}
        title="About these numbers"
      >
        <div className="prose">
          <p>
            Each bar spans the average diastolic (bottom) to systolic (top) reading for that day,
            week or month. The shaded band marks the NICE home-monitoring threshold of 135/85.
          </p>
          <p>
            Categories use NICE home-monitoring thresholds, which apply to averages over several
            days:
          </p>
          <ul>
            <li>Normal: below 135/85</li>
            <li>Stage 1 hypertension: 135/85 or above</li>
            <li>Stage 2 hypertension: 150/95 or above</li>
            <li>Severe hypertension: 180/120 or above</li>
            <li>Low: below 90/60</li>
          </ul>
          <p>
            Morning is 03:00 to 11:59; anything later is evening, and readings after midnight count
            towards the previous evening. This isn't medical advice.
          </p>
        </div>
        <button
          type="button"
          className="button block plain"
          onClick={() => {
            setAboutOpen(false);
          }}
        >
          Done
        </button>
      </Sheet>
    </Page>
  );
}
