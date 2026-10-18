import { Download } from "lucide-react";
import { useState } from "react";
import { sessionDayKey } from "../../../shared/bp.ts";
import { localDateKey } from "../../../shared/time.ts";
import { useData, type DisplaySession } from "../../data.tsx";
import { formatMonthKey, formatRelativeDayKey } from "../../format.ts";
import { Page } from "../../ui/Page.tsx";
import { SessionRow } from "./SessionRow.tsx";

const MONTHS_PER_PAGE = 3;

export function BpHistoryPage() {
  const { sessions, connection } = useData();
  const [monthsShown, setMonthsShown] = useState(MONTHS_PER_PAGE);
  const today = localDateKey(new Date());

  const newestFirst = [...sessions].reverse();
  const byMonth = [
    ...Map.groupBy(newestFirst, (s) => sessionDayKey(new Date(s.takenAt)).slice(0, 7)).entries(),
  ];
  const shown = byMonth.slice(0, monthsShown);

  return (
    <Page
      title="All readings"
      back={{ to: "/bp", label: "Blood pressure" }}
      action={
        connection === "online" && (
          <a
            href="/api/bp/export.csv"
            className="round-button plain"
            aria-label="Download all readings as CSV"
            download
          >
            <Download size={20} aria-hidden="true" />
          </a>
        )
      }
    >
      {newestFirst.length === 0 && <p className="empty">No readings yet.</p>}
      {shown.map(([month, monthSessions]) => (
        <section key={month} className="history-month">
          <h2 className="history-month-title">
            {formatMonthKey(`${month}-01`)}
            <span className="history-month-count">
              {monthSessions.length} session{monthSessions.length === 1 ? "" : "s"}
            </span>
          </h2>
          <div className="card list-card">
            {[
              ...Map.groupBy(monthSessions, (s: DisplaySession) =>
                sessionDayKey(new Date(s.takenAt)),
              ).entries(),
            ].map(([day, daySessions]) => (
              <div key={day} className="history-day">
                <div className="history-day-title">{formatRelativeDayKey(day, today)}</div>
                {daySessions.map((s) => (
                  <SessionRow key={s.id} session={s} />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
      {monthsShown < byMonth.length && (
        <button
          type="button"
          className="button block plain"
          onClick={() => {
            setMonthsShown((n) => n + MONTHS_PER_PAGE);
          }}
        >
          Show earlier months
        </button>
      )}
    </Page>
  );
}
