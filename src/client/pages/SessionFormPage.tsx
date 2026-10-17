import { useRef, useState, type SyntheticEvent } from "react";
import { useNavigate, useParams } from "react-router";
import {
  averageReadings,
  MAX_NOTE_LENGTH,
  MAX_READINGS_PER_SESSION,
  READING_LIMITS,
  readingSchema,
  readingWarnings,
  WARNING_MESSAGES,
  type BpSession,
  type BpSessionInput,
  type Reading,
} from "../../shared/bp.ts";
import {
  formatLocalDateTimeInput,
  fromLocal,
  parseLocalDateTimeInput,
  toLocal,
} from "../../shared/time.ts";
import { useToast } from "../components/Toast.tsx";
import { useData } from "../data.tsx";
import { formatBp } from "../format.ts";

type FieldName = keyof Reading;
const FIELDS: readonly FieldName[] = ["systolic", "diastolic", "heartRate"];
const FIELD_LABELS: Record<FieldName, string> = {
  systolic: "Systolic",
  diastolic: "Diastolic",
  heartRate: "Pulse",
};

type RowDraft = Record<FieldName, string>;

const emptyRow = (): RowDraft => ({ systolic: "", diastolic: "", heartRate: "" });

const rowFromReading = (r: Reading): RowDraft => ({
  systolic: String(r.systolic),
  diastolic: String(r.diastolic),
  heartRate: r.heartRate === null ? "" : String(r.heartRate),
});

const toNumber = (value: string): number | undefined => (value === "" ? undefined : Number(value));

type RowResult =
  { ok: true; reading: Reading } | { ok: false; errors: Partial<Record<FieldName, string>> };

function parseRow(row: RowDraft): RowResult {
  const result = readingSchema.safeParse({
    systolic: toNumber(row.systolic),
    diastolic: toNumber(row.diastolic),
    heartRate: row.heartRate === "" ? null : Number(row.heartRate),
  });
  if (result.success) return { ok: true, reading: result.data };
  const errors: Partial<Record<FieldName, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field === "systolic" || field === "diastolic" || field === "heartRate") {
      errors[field] ??= issue.message;
    } else {
      throw new Error(`Unexpected validation issue at ${JSON.stringify(issue.path)}`);
    }
  }
  return { ok: false, errors };
}

/** Moves on once another digit would make the value too large to be valid. */
const isComplete = (value: string, field: FieldName): boolean =>
  value !== "" && Number(`${value}0`) > READING_LIMITS[field].max;

type TimeResult = { ok: true; takenAt: string } | { ok: false; error: string };

function parseTime(value: string): TimeResult {
  try {
    return { ok: true, takenAt: fromLocal(parseLocalDateTimeInput(value)).toISOString() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid time" };
  }
}

export function NewSessionPage() {
  const { settings, connection } = useData();
  // Wait for the stored setting so the form doesn't start with the default number of readings.
  if (connection === "loading") {
    return <p className="muted">Loading…</p>;
  }
  return <SessionForm existing={null} defaultCount={settings.readingsPerSession} />;
}

export function EditSessionPage() {
  const { id } = useParams();
  const { sessions, connection } = useData();
  const session = sessions.find((s) => s.id === id);
  if (session === undefined) {
    return <p className="muted">{connection === "loading" ? "Loading…" : "Reading not found."}</p>;
  }
  if (session.pending) {
    return (
      <p className="muted">
        This reading hasn't synced yet. You can edit it once it has reached the laptop.
      </p>
    );
  }
  return <SessionForm key={session.id} existing={session} defaultCount={session.readings.length} />;
}

function SessionForm({
  existing,
  defaultCount,
}: {
  existing: BpSession | null;
  defaultCount: number;
}) {
  const { addSession, updateSession, deleteSession, restoreSession } = useData();
  const navigate = useNavigate();
  const toast = useToast();

  const [time, setTime] = useState(() =>
    formatLocalDateTimeInput(toLocal(existing === null ? new Date() : new Date(existing.takenAt))),
  );
  const [rows, setRows] = useState<RowDraft[]>(() =>
    existing === null
      ? Array.from({ length: defaultCount }, emptyRow)
      : existing.readings.map(rowFromReading),
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const parsedRows = rows.map(parseRow);
  const parsedTime = parseTime(time);
  const validReadings = parsedRows.flatMap((r) => (r.ok ? [r.reading] : []));
  const average = validReadings.length > 0 ? averageReadings(validReadings) : null;

  const focusAfter = (rowIndex: number, field: FieldName) => {
    const order = rows.flatMap((_, i) => FIELDS.map((f) => `${String(i)}-${f}`));
    const next = order[order.indexOf(`${String(rowIndex)}-${field}`) + 1];
    if (next !== undefined) inputs.current.get(next)?.focus();
  };

  const updateField = (rowIndex: number, field: FieldName, raw: string) => {
    const value = raw.replace(/\D/g, "").slice(0, 3);
    setRows((current) => current.map((r, i) => (i === rowIndex ? { ...r, [field]: value } : r)));
    if (isComplete(value, field)) focusAfter(rowIndex, field);
  };

  const onSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setSaveError(null);
    if (!parsedTime.ok || parsedRows.some((r) => !r.ok)) return;
    const input: BpSessionInput = {
      id: existing?.id ?? crypto.randomUUID(),
      takenAt: parsedTime.takenAt,
      note: note.trim() === "" ? null : note,
      readings: validReadings,
    };
    setSaving(true);
    try {
      if (existing === null) {
        const result = await addSession(input);
        toast({
          text: result === "saved" ? "Reading saved" : "Saved on this device. It will sync later.",
        });
        void navigate("/");
      } else {
        await updateSession(input);
        toast({ text: "Changes saved" });
        void navigate("/bp/history");
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (existing === null) return;
    if (!window.confirm("Delete this reading?")) return;
    setSaving(true);
    try {
      await deleteSession(existing.id);
      toast({
        text: "Reading deleted",
        action: { label: "Undo", run: () => restoreSession(existing.id) },
      });
      void navigate("/bp/history");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <form className="stack" onSubmit={(e) => void onSubmit(e)} noValidate>
      <h1>{existing === null ? "New reading" : "Edit reading"}</h1>

      <div className="field">
        <label htmlFor="taken-at">Time taken</label>
        <div className="row">
          <input
            id="taken-at"
            type="datetime-local"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
            }}
            aria-invalid={!parsedTime.ok}
            style={{ flex: 1 }}
          />
          {existing === null && (
            <button
              type="button"
              className="button"
              onClick={() => {
                setTime(formatLocalDateTimeInput(toLocal(new Date())));
              }}
            >
              Now
            </button>
          )}
        </div>
        {!parsedTime.ok && <span className="field-error">{parsedTime.error}</span>}
      </div>

      <div className="card stack">
        {rows.map((row, i) => {
          const parsed = parsedRows[i];
          if (parsed === undefined) throw new Error("Row and parse result out of step");
          const errors: Partial<Record<FieldName, string>> =
            submitted && !parsed.ok ? parsed.errors : {};
          return (
            <div key={i} className="stack" style={{ gap: 4 }}>
              <div className="reading-row">
                <span className="index" aria-hidden="true">
                  {i + 1}
                </span>
                {FIELDS.map((field) => {
                  const id = `reading-${String(i)}-${field}`;
                  const error = errors[field];
                  return (
                    <div className="field" key={field}>
                      <label htmlFor={id}>
                        {FIELD_LABELS[field]}
                        {field === "heartRate" && <span className="muted"> (optional)</span>}
                        <span className="sr-only"> for reading {i + 1}</span>
                      </label>
                      <input
                        id={id}
                        ref={(el) => {
                          const key = `${String(i)}-${field}`;
                          if (el === null) inputs.current.delete(key);
                          else inputs.current.set(key, el);
                        }}
                        className="number"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        enterKeyHint="next"
                        value={row[field]}
                        aria-invalid={error !== undefined}
                        onChange={(e) => {
                          updateField(i, field, e.target.value);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              {Object.values(errors).map((message) => (
                <span key={message} className="field-error">
                  Reading {i + 1}: {message}
                </span>
              ))}
              {parsed.ok &&
                readingWarnings(parsed.reading).map((w) => (
                  <span key={w} className="field-warning">
                    Reading {i + 1}: {WARNING_MESSAGES[w]}
                  </span>
                ))}
            </div>
          );
        })}
        <div className="row">
          <button
            type="button"
            className="button"
            disabled={rows.length >= MAX_READINGS_PER_SESSION}
            onClick={() => {
              setRows((r) => [...r, emptyRow()]);
            }}
          >
            Add reading
          </button>
          <button
            type="button"
            className="button"
            disabled={rows.length <= 1}
            onClick={() => {
              setRows((r) => r.slice(0, -1));
            }}
          >
            Remove last
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="note">Note (optional)</label>
        <textarea
          id="note"
          rows={2}
          maxLength={MAX_NOTE_LENGTH}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </div>

      {average !== null && (
        <p className="secondary" aria-live="polite">
          Average of {validReadings.length} reading{validReadings.length === 1 ? "" : "s"}:{" "}
          <strong className="tabular">{formatBp(average)}</strong>
          {average.heartRate !== null && <> · pulse {Math.round(average.heartRate)}</>}
        </p>
      )}

      {saveError !== null && <p className="field-error">Couldn't save: {saveError}</p>}

      <button type="submit" className="button primary big" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      {existing !== null && (
        <button
          type="button"
          className="button danger"
          disabled={saving}
          onClick={() => void onDelete()}
        >
          Delete reading
        </button>
      )}
    </form>
  );
}
