import { useState } from "react";
import { SessionList } from "../components/SessionList.tsx";
import { useData } from "../data.tsx";

const PAGE_SIZE = 60;

export function HistoryPage() {
  const { sessions } = useData();
  const [shown, setShown] = useState(PAGE_SIZE);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params = new URLSearchParams();
  if (from !== "") params.set("from", from);
  if (to !== "") params.set("to", to);
  const query = params.toString();

  return (
    <div className="stack">
      <h1>History</h1>
      <div className="card">
        <SessionList sessions={sessions.slice(-shown)} />
        {shown < sessions.length && (
          <button
            type="button"
            className="button"
            onClick={() => {
              setShown((n) => n + PAGE_SIZE);
            }}
          >
            Show older
          </button>
        )}
      </div>

      <h2>Export</h2>
      <div className="card stack">
        <p className="secondary small" style={{ margin: 0 }}>
          Download readings as a CSV file, for example to share with a doctor. Leave the dates blank
          to include everything.
        </p>
        <div className="row">
          <div className="field">
            <label htmlFor="export-from">From</label>
            <input
              id="export-from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="export-to">To</label>
            <input
              id="export-to"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
              }}
            />
          </div>
        </div>
        <a
          className="button"
          href={`/api/bp/export.csv${query === "" ? "" : `?${query}`}`}
          download
        >
          Download CSV
        </a>
      </div>
    </div>
  );
}
