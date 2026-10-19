import { Heart } from "lucide-react";
import type { Dispatch } from "react";
import { readingWarnings, WARNING_MESSAGES } from "../../../../shared/bp.ts";
import { Keypad } from "./Keypad.tsx";
import {
  FIELD_LABELS,
  isRowEmpty,
  parseRow,
  type EntryAction,
  type EntryState,
  type FieldName,
  type RowDraft,
} from "./model.ts";

function ReadingDisplay({
  row,
  activeField,
  onFocus,
}: {
  row: RowDraft;
  activeField: FieldName;
  onFocus: (field: FieldName) => void;
}) {
  const field = (name: FieldName) => (
    <button
      type="button"
      className={`reading-field ${name}${name === activeField ? " active" : ""}`}
      aria-label={`${FIELD_LABELS[name]}${name === "heartRate" ? " (optional)" : ""}: ${row[name] === "" ? "empty" : row[name]}`}
      aria-pressed={name === activeField}
      onClick={() => {
        onFocus(name);
      }}
    >
      <span className="reading-digits rounded-nums" data-testid={`field-${name}`}>
        {row[name] === "" ? <span className="placeholder">–</span> : row[name]}
        {name === activeField && <span className="caret" aria-hidden="true" />}
      </span>
      <span className="reading-label">
        {name === "heartRate" && <Heart size={12} aria-hidden="true" />}
        {FIELD_LABELS[name]}
      </span>
    </button>
  );
  return (
    <div className="reading-display">
      <div className="reading-pressure">
        {field("systolic")}
        <span className="reading-slash" aria-hidden="true">
          /
        </span>
        {field("diastolic")}
      </div>
      {field("heartRate")}
    </div>
  );
}

/** What to show under the reading: an error, a tip before the first reading, or warnings. */
function Feedback({ state, row, showTip }: { state: EntryState; row: RowDraft; showTip: boolean }) {
  if (state.error !== null) return <span className="entry-error">{state.error}</span>;
  if (showTip && isRowEmpty(row)) {
    return (
      <span className="entry-tip">
        Sit upright with your back supported and your arm resting at heart height.
      </span>
    );
  }
  const parsed = parseRow(row);
  if (!parsed.ok) return null;
  return readingWarnings(parsed.reading).map((w) => (
    <span key={w} className="entry-warning">
      {WARNING_MESSAGES[w]}
    </span>
  ));
}

/** Entering one reading on the keypad. */
export function ReadingStep({
  state,
  index,
  field,
  isNewSession,
  dispatch,
}: {
  state: EntryState;
  index: number;
  field: FieldName;
  isNewSession: boolean;
  dispatch: Dispatch<EntryAction>;
}) {
  const row = state.rows[index];
  if (row === undefined) throw new Error(`No reading at index ${String(index)}`);
  const nextLabel = field !== "heartRate" ? "Next" : row.heartRate === "" ? "Skip pulse" : "Done";

  return (
    <div className="entry-reading">
      <p className="entry-step-label">
        Reading {index + 1} of {state.rows.length}
      </p>
      <ReadingDisplay
        row={row}
        activeField={field}
        onFocus={(f) => {
          dispatch({ type: "focus", field: f });
        }}
      />
      <div className="entry-feedback" aria-live="polite">
        <Feedback state={state} row={row} showTip={isNewSession && index === 0} />
      </div>
      <div className="entry-controls">
        <div className="entry-actions">
          {state.returnToReview && state.rows.length > 1 ? (
            <button
              type="button"
              className="button plain destructive-text"
              onClick={() => {
                dispatch({ type: "remove-reading", index });
              }}
            >
              Remove
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="button pill bp"
            onClick={() => {
              dispatch({ type: "next" });
            }}
          >
            {nextLabel}
          </button>
        </div>
        <Keypad
          onDigit={(digit) => {
            dispatch({ type: "digit", digit });
          }}
          onBackspace={() => {
            dispatch({ type: "backspace" });
          }}
        />
      </div>
    </div>
  );
}
