import { Check } from "lucide-react";
import type { Dispatch } from "react";
import { readingSummary } from "./format.ts";
import { parseRow, type EntryAction, type RowDraft } from "./model.ts";
import { RestTimer } from "./RestTimer.tsx";

/** The pause between readings, showing the reading just taken so it can be corrected. */
export function RestStep({
  rows,
  nextIndex,
  endsAt,
  restSeconds,
  dispatch,
}: {
  rows: readonly RowDraft[];
  nextIndex: number;
  endsAt: number;
  restSeconds: number;
  dispatch: Dispatch<EntryAction>;
}) {
  const previousRow = rows[nextIndex - 1];
  const previous = previousRow === undefined ? null : parseRow(previousRow);
  return (
    <div className="entry-rest">
      {previous?.ok === true && (
        <button
          type="button"
          className="rest-previous"
          onClick={() => {
            dispatch({ type: "edit-reading", index: nextIndex - 1 });
          }}
        >
          <Check size={16} aria-hidden="true" /> Reading {nextIndex}:{" "}
          <span className="rounded-nums">{readingSummary(previous.reading)}</span>
          <span className="rest-edit">Edit</span>
        </button>
      )}
      <RestTimer
        endsAt={endsAt}
        totalSeconds={restSeconds}
        nextLabel={`Reading ${String(nextIndex + 1)}`}
        onDone={() => {
          dispatch({ type: "rest-done" });
        }}
      />
    </div>
  );
}
