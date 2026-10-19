import { useState } from "react";
import {
  formatLocalDateTimeInput,
  fromLocal,
  parseLocalDateTimeInput,
  toLocal,
} from "../../../../shared/time.ts";
import { Sheet } from "../../../ui/Sheet.tsx";

/** Lets the time of a reading be changed. Mount it only while open, so it starts fresh. */
export function TimeSheet({
  takenAt,
  onClose,
  onChange,
}: {
  takenAt: string;
  onClose: () => void;
  onChange: (takenAt: string) => void;
}) {
  const [openedWith] = useState(() => ({
    value: formatLocalDateTimeInput(toLocal(new Date(takenAt))),
    at: Date.now(),
  }));
  const [value, setValue] = useState(openedWith.value);

  let error: string | null = null;
  let parsed: string | null = null;
  try {
    const instant = fromLocal(parseLocalDateTimeInput(value));
    if (instant.getTime() > openedWith.at + 5 * 60_000) error = "The time can't be in the future";
    else parsed = instant.toISOString();
  } catch (err) {
    error = err instanceof Error ? err.message : "Invalid time";
  }

  return (
    <Sheet open onClose={onClose} title="When was this taken?">
      <input
        type="datetime-local"
        className="time-input"
        aria-label="Time taken"
        value={value}
        max={formatLocalDateTimeInput(toLocal(new Date(openedWith.at)))}
        onChange={(e) => {
          setValue(e.target.value);
        }}
      />
      {error !== null && <p className="entry-error">{error}</p>}
      <div className="sheet-actions">
        <button
          type="button"
          className="button block primary"
          disabled={parsed === null}
          onClick={() => {
            // Re-parsing an untouched value would drop seconds, and could pick the other
            // instant of an hour repeated by the autumn clock change.
            if (parsed !== null && value !== openedWith.value) onChange(parsed);
            onClose();
          }}
        >
          Done
        </button>
        <button
          type="button"
          className="button block plain"
          onClick={() => {
            setValue(formatLocalDateTimeInput(toLocal(new Date())));
          }}
        >
          Use current time
        </button>
      </div>
    </Sheet>
  );
}
