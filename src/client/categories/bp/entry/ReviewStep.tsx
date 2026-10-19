import { ChevronRight, Clock, Heart, Plus } from "lucide-react";
import type { Dispatch } from "react";
import {
  averageReadings,
  MAX_NOTE_LENGTH,
  MAX_READINGS_PER_SESSION,
  readingWarnings,
  WARNING_MESSAGES,
  type Reading,
} from "../../../../shared/bp.ts";
import { formatBp } from "../../../format.ts";
import { formatTakenAt, readingSummary } from "./format.ts";
import type { EntryAction } from "./model.ts";

const NOTE_SUGGESTIONS = [
  "After exercise",
  "After caffeine",
  "Stressed",
  "Feeling unwell",
] as const;

const noteParts = (note: string) =>
  note
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");

/** Adds or removes a suggested phrase in a comma-separated note. */
export function toggleNoteSuggestion(note: string, text: string): string {
  const parts = noteParts(note);
  return (parts.includes(text) ? parts.filter((p) => p !== text) : [...parts, text]).join(", ");
}

/** The summary before saving: readings, time, note, and save or delete. */
export function ReviewStep({
  readings,
  rowCount,
  takenAt,
  note,
  mode,
  saving,
  saveError,
  dispatch,
  onEditTime,
  onNoteChange,
  onSave,
  onDelete,
}: {
  /** Only the complete readings; saving is disabled until every row is one. */
  readings: readonly Reading[];
  rowCount: number;
  takenAt: string;
  note: string;
  mode: "new" | "edit";
  saving: boolean;
  saveError: string | null;
  dispatch: Dispatch<EntryAction>;
  onEditTime: () => void;
  onNoteChange: (note: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const average = readings.length > 0 ? averageReadings(readings) : null;
  const warnings = [...new Set(readings.flatMap(readingWarnings))];

  return (
    <div className="entry-review">
      {average !== null && (
        <div className="review-hero">
          <span className="review-label">
            {readings.length === 1 ? "Reading" : `Average of ${String(readings.length)} readings`}
          </span>
          <span className="review-value rounded-nums">
            {formatBp(average)} <span className="review-unit">mmHg</span>
          </span>
          {average.heartRate !== null && (
            <span className="review-pulse">
              <Heart size={14} aria-hidden="true" /> {Math.round(average.heartRate)} bpm
            </span>
          )}
        </div>
      )}

      <div className="card list-card">
        {readings.map((r, i) => (
          <button
            key={i}
            type="button"
            className="list-row interactive"
            onClick={() => {
              dispatch({ type: "edit-reading", index: i });
            }}
          >
            <span className="list-text">
              <span className="list-title">Reading {i + 1}</span>
            </span>
            <span className="list-value rounded-nums">{readingSummary(r)}</span>
            <ChevronRight className="list-chevron" size={18} aria-hidden="true" />
          </button>
        ))}
        {rowCount < MAX_READINGS_PER_SESSION && (
          <button
            type="button"
            className="list-row interactive"
            onClick={() => {
              dispatch({ type: "add-reading" });
            }}
          >
            <span className="list-icon tinted">
              <Plus size={16} aria-hidden="true" />
            </span>
            <span className="list-text">
              <span className="list-title accent">Add a reading</span>
            </span>
          </button>
        )}
        <button type="button" className="list-row interactive" onClick={onEditTime}>
          <span className="list-icon tinted">
            <Clock size={16} aria-hidden="true" />
          </span>
          <span className="list-text">
            <span className="list-title">Time</span>
          </span>
          <span className="list-value">{formatTakenAt(takenAt)}</span>
          <ChevronRight className="list-chevron" size={18} aria-hidden="true" />
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="review-warnings">
          {warnings.map((w) => (
            <p key={w} className="entry-warning">
              {WARNING_MESSAGES[w]}
            </p>
          ))}
        </div>
      )}

      <div className="note-field">
        <label htmlFor="note" className="field-label">
          Note
        </label>
        <textarea
          id="note"
          rows={2}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="Anything worth remembering?"
          value={note}
          onChange={(e) => {
            onNoteChange(e.target.value);
          }}
        />
        <div className="chips">
          {NOTE_SUGGESTIONS.map((text) => (
            <button
              key={text}
              type="button"
              className="chip"
              aria-pressed={noteParts(note).includes(text)}
              onClick={() => {
                onNoteChange(toggleNoteSuggestion(note, text));
              }}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {saveError !== null && <p className="entry-error">Couldn't save: {saveError}</p>}

      <div className="review-actions">
        <button
          type="button"
          className="button block bp large"
          disabled={saving || readings.length !== rowCount}
          onClick={onSave}
        >
          {mode === "new" ? "Save reading" : "Save changes"}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            className="button block plain destructive-text"
            disabled={saving}
            onClick={onDelete}
          >
            Delete reading
          </button>
        )}
      </div>
    </div>
  );
}
