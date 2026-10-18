import { Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { averageReadings, type BpAverage } from "../../../shared/bp.ts";
import { formatTime, localDateKey } from "../../../shared/time.ts";
import { useData } from "../../data.tsx";
import { BP_STATUS, formatBp, formatDayKeyWithYear, formatShortDayKey } from "../../format.ts";
import { categorise } from "../../../shared/bp.ts";
import { Page } from "../../ui/Page.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { buildReport, presetRange, REPORT_PRESETS } from "./report.ts";

type Preset = (typeof REPORT_PRESETS)[number]["label"] | "Custom";

const generatedFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/London",
});

function Figure({
  label,
  average,
  detail,
}: {
  label: string;
  average: BpAverage | null;
  detail: string;
}) {
  return (
    <div className="report-figure">
      <span className="report-figure-label">{label}</span>
      <span className="report-figure-value rounded-nums">
        {average === null ? "–" : formatBp(average)}
      </span>
      <span className="report-figure-detail">
        {average === null ? "No readings" : `${detail} · ${BP_STATUS[categorise(average)].label}`}
      </span>
    </div>
  );
}

export function BpReportPage() {
  const { sessions } = useData();
  const today = localDateKey(new Date());
  const [preset, setPreset] = useState<Preset>("30 days");
  const [custom, setCustom] = useState(() => presetRange(30, today));

  const range = useMemo(() => {
    const match = REPORT_PRESETS.find((p) => p.label === preset);
    return match === undefined ? custom : presetRange(match.days, today);
  }, [preset, custom, today]);
  const valid = range.from !== "" && range.to !== "" && range.from <= range.to;
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  const report = useMemo(
    () => (valid ? buildReport(sessions, range.from, range.to) : null),
    [sessions, range, valid],
  );

  return (
    <Page
      title="Report"
      back={{ to: "/bp", label: "Blood pressure" }}
      action={
        <button
          type="button"
          className="round-button plain"
          aria-label="Print or save as PDF"
          onClick={() => {
            window.print();
          }}
        >
          <Printer size={20} aria-hidden="true" />
        </button>
      }
    >
      <div className="report-controls">
        <Segmented
          label="Report period"
          options={[
            ...REPORT_PRESETS.map((p) => ({ value: p.label, label: p.label })),
            { value: "Custom", label: "Custom" },
          ]}
          value={preset}
          onChange={setPreset}
        />
        {preset === "Custom" && (
          <div className="report-dates">
            <label>
              From
              <input
                type="date"
                value={custom.from}
                max={today}
                onChange={(e) => {
                  setCustom((c) => ({ ...c, from: e.target.value }));
                }}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={custom.to}
                max={today}
                onChange={(e) => {
                  setCustom((c) => ({ ...c, to: e.target.value }));
                }}
              />
            </label>
          </div>
        )}
        <p className="report-hint">
          Use the print button to print or save as a PDF to share with your GP.
        </p>
      </div>

      {report === null ? (
        <p className="entry-error">Choose a start date before the end date.</p>
      ) : (
        <article className="card report">
          <header className="report-header">
            <h2>Home blood pressure readings</h2>
            <p>
              {formatDayKeyWithYear(report.from)} to {formatDayKeyWithYear(report.to)} ·{" "}
              {report.sessions.length} session{report.sessions.length === 1 ? "" : "s"},{" "}
              {report.readingCount} reading
              {report.readingCount === 1 ? "" : "s"}
            </p>
          </header>

          <div className="report-figures">
            <Figure
              label="Average"
              average={report.overall}
              detail={`${String(report.sessions.length)} sessions`}
            />
            <Figure
              label="Morning"
              average={report.morning.average}
              detail={`${String(report.morning.count)} sessions`}
            />
            <Figure
              label="Evening"
              average={report.evening.average}
              detail={`${String(report.evening.count)} sessions`}
            />
          </div>

          {report.sessions.length > 0 && (
            <table className="report-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Time</th>
                  <th scope="col">Readings (mmHg)</th>
                  <th scope="col">Average</th>
                  <th scope="col">Pulse</th>
                </tr>
              </thead>
              <tbody>
                {report.sessions.map((s) => {
                  const takenAt = new Date(s.takenAt);
                  const avg = averageReadings(s.readings);
                  return (
                    <tr key={s.id}>
                      <td>
                        {sameYear
                          ? formatShortDayKey(localDateKey(takenAt))
                          : formatDayKeyWithYear(localDateKey(takenAt))}
                      </td>
                      <td>{formatTime(takenAt)}</td>
                      <td>
                        {s.readings
                          .map((r) => `${String(r.systolic)}/${String(r.diastolic)}`)
                          .join(", ")}
                        {s.note !== null && <span className="report-note">{s.note}</span>}
                      </td>
                      <td className="report-average">{formatBp(avg)}</td>
                      <td>{avg.heartRate === null ? "–" : Math.round(avg.heartRate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <footer className="report-footer">
            Times are UK time (24-hour). Morning is 03:00–11:59. Averages weight each session
            equally, and each session is the mean of its readings. Categories use NICE
            home-monitoring thresholds (stage 1 from 135/85, stage 2 from 150/95). Generated{" "}
            {generatedFormat.format(new Date())}.
          </footer>
        </article>
      )}
    </Page>
  );
}
