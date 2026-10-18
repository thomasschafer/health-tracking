import { Check, ChevronRight, Clock, Heart, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  averageReadings,
  MAX_NOTE_LENGTH,
  MAX_READINGS_PER_SESSION,
  readingWarnings,
  WARNING_MESSAGES,
  type BpSessionInput,
  type Reading,
} from "../../../../shared/bp.ts";
import {
  formatLocalDateTimeInput,
  formatTime,
  fromLocal,
  localDateKey,
  parseLocalDateTimeInput,
  toLocal,
} from "../../../../shared/time.ts";
import { useData } from "../../../data.tsx";
import { formatBp, formatRelativeDayKey } from "../../../format.ts";
import { ConfirmSheet, Sheet } from "../../../ui/Sheet.tsx";
import { useToast } from "../../../ui/Toast.tsx";
import { PeriodIcon } from "../SessionRow.tsx";
import { clearDraft, loadDraft, saveDraft } from "./draft.ts";
import { Keypad } from "./Keypad.tsx";
import {
  emptyRow,
  entryReducer,
  FIELD_LABELS,
  isRowEmpty,
  parseRow,
  rowFromReading,
  type EntryAction,
  type EntryState,
  type FieldName,
  type RowDraft,
} from "./model.ts";
import { RestTimer } from "./RestTimer.tsx";

const NOTE_SUGGESTIONS = [
  "After exercise",
  "After caffeine",
  "Stressed",
  "Feeling unwell",
] as const;

interface Initial {
  id: string;
  takenAt: string;
  rows: RowDraft[];
  note: string;
}

export function NewBpSessionPage() {
  const { settings, settingsReady } = useData();
  const navigate = useNavigate();
  const [restored, setRestored] = useState(() => loadDraft(new Date()));
  const [attempt, setAttempt] = useState(0);
  // Without a draft, wait for the stored settings so the number of readings is right.
  if (restored === null && !settingsReady) {
    return (
      <div className="entry" aria-busy="true">
        <header className="entry-header">
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={() => void navigate(-1)}
          >
            <X size={24} aria-hidden="true" />
          </button>
        </header>
      </div>
    );
  }
  return (
    <NewEntry
      key={attempt}
      restored={restored}
      readingsPerSession={settings.readingsPerSession}
      restSeconds={settings.restTimerSeconds}
      onStartOver={() => {
        clearDraft();
        setRestored(null);
        setAttempt((n) => n + 1);
      }}
    />
  );
}

function NewEntry({
  restored,
  readingsPerSession,
  restSeconds,
  onStartOver,
}: {
  restored: Initial | null;
  readingsPerSession: number;
  restSeconds: number;
  onStartOver: () => void;
}) {
  // Created once, so the ID and time stay stable while the reading is entered. The time
  // reflects when entry started rather than when it was saved.
  const [start] = useState<Initial>(
    () =>
      restored ?? {
        id: crypto.randomUUID(),
        takenAt: new Date().toISOString(),
        rows: Array.from({ length: readingsPerSession }, emptyRow),
        note: "",
      },
  );
  return (
    <EntryFlow
      mode="new"
      initial={start}
      restored={restored !== null}
      restSeconds={restSeconds}
      onStartOver={onStartOver}
    />
  );
}

export function EditBpSessionPage() {
  const { id } = useParams();
  const { sessions, connection, settings } = useData();
  const navigate = useNavigate();
  const session = sessions.find((s) => s.id === id);
  if (session === undefined || session.pending) {
    return (
      <div className="entry">
        <header className="entry-header">
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={() => void navigate("/bp")}
          >
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <p className="entry-message">
          {connection === "loading"
            ? "Loading…"
            : session?.pending === true
              ? "This reading hasn't synced yet. You can edit it once it has reached the laptop."
              : "Reading not found."}
        </p>
      </div>
    );
  }
  return (
    <EntryFlow
      key={session.id}
      mode="edit"
      initial={{
        id: session.id,
        takenAt: session.takenAt,
        rows: session.readings.map(rowFromReading),
        note: session.note ?? "",
      }}
      restored={false}
      restSeconds={settings.restTimerSeconds}
      onStartOver={null}
    />
  );
}

function formatTakenAt(takenAt: string): string {
  const date = new Date(takenAt);
  return `${formatRelativeDayKey(localDateKey(date), localDateKey(new Date()))}, ${formatTime(date)}`;
}

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

function readingSummary(r: Reading): string {
  return `${String(r.systolic)}/${String(r.diastolic)}${r.heartRate === null ? "" : ` · ${String(r.heartRate)} bpm`}`;
}

function EntryFlow({
  mode,
  initial,
  restored,
  restSeconds,
  onStartOver,
}: {
  mode: "new" | "edit";
  initial: Initial;
  restored: boolean;
  restSeconds: number;
  onStartOver: (() => void) | null;
}) {
  const { addSession, updateSession, deleteSession, restoreSession } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const config = useMemo(() => ({ restSeconds, now: () => Date.now() }), [restSeconds]);
  const reducer = useCallback(
    (s: EntryState, a: EntryAction) => entryReducer(s, a, config),
    [config],
  );
  const [state, dispatch] = useReducer(reducer, null, (): EntryState => {
    const firstIncomplete = initial.rows.findIndex((r) => !parseRow(r).ok);
    return {
      rows: initial.rows,
      step:
        mode === "edit" || firstIncomplete === -1
          ? { kind: "review" }
          : { kind: "reading", index: firstIncomplete, field: "systolic" },
      returnToReview: false,
      error: null,
      replace: false,
    };
  });
  const [takenAt, setTakenAt] = useState(initial.takenAt);
  const [note, setNote] = useState(initial.note);
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeValue, setTimeValue] = useState("");
  const [timeOpenedWith, setTimeOpenedWith] = useState({ value: "", at: 0 });
  const timeEdited = useRef(false);
  const [confirm, setConfirm] = useState<"discard" | "delete" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showRestored, setShowRestored] = useState(restored);
  const savedRef = useRef(false);

  const hasData = state.rows.some((r) => !isRowEmpty(r)) || note.trim() !== "";
  const dirty =
    JSON.stringify({ rows: state.rows, note, takenAt }) !==
    JSON.stringify({ rows: initial.rows, note: initial.note, takenAt: initial.takenAt });

  // The app may be left open on this screen and resumed hours later. Until something has been
  // entered, keep the time current so the reading isn't filed at the wrong time of day.
  const hasDataRef = useRef(hasData);
  useEffect(() => {
    hasDataRef.current = hasData;
  }, [hasData]);
  useEffect(() => {
    if (mode !== "new") return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && !hasDataRef.current && !timeEdited.current) {
        setTakenAt(new Date().toISOString());
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "new" || savedRef.current) return;
    if (hasData) {
      saveDraft({
        id: initial.id,
        takenAt,
        rows: state.rows,
        note,
        savedAt: new Date().toISOString(),
      });
    } else {
      clearDraft();
    }
  }, [mode, hasData, initial.id, takenAt, state.rows, note]);

  const { step } = state;

  useEffect(() => {
    if (step.kind !== "reading") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      // Leave text fields and anything inside an open sheet alone.
      if (target?.closest("input, textarea, select, dialog[open]") != null) return;
      if (/^\d$/.test(event.key)) dispatch({ type: "digit", digit: event.key });
      else if (event.key === "Backspace") dispatch({ type: "backspace" });
      // Enter on a focused button should activate that button instead.
      else if (event.key === "Enter" && target?.closest("button, a") == null)
        dispatch({ type: "next" });
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [step.kind]);

  const leave = useCallback(() => {
    // Go back if the app was navigated within; otherwise (e.g. opened directly) go to the overview.
    if (location.key !== "default") void navigate(-1);
    else void navigate("/bp", { replace: true });
  }, [location.key, navigate]);

  const close = () => {
    if (mode === "new" ? hasData : dirty) {
      setConfirm("discard");
    } else {
      clearDraft();
      leave();
    }
  };

  const parsedRows = state.rows.map(parseRow);
  const readings = parsedRows.flatMap((r) => (r.ok ? [r.reading] : []));
  const average = readings.length > 0 ? averageReadings(readings) : null;
  const warnings = [...new Set(readings.flatMap(readingWarnings))];

  const save = async () => {
    if (readings.length !== state.rows.length || readings.length === 0) {
      throw new Error("Tried to save with incomplete readings");
    }
    const input: BpSessionInput = {
      id: initial.id,
      takenAt,
      note: note.trim() === "" ? null : note,
      readings,
    };
    setSaving(true);
    setSaveError(null);
    try {
      if (mode === "new") {
        // The session is persisted to the offline queue before it is sent, so the draft can go
        // now. Keeping it would offer the same reading again if the app closed mid-save.
        savedRef.current = true;
        clearDraft();
        let result: Awaited<ReturnType<typeof addSession>>;
        try {
          result = await addSession(input);
        } catch (err) {
          savedRef.current = false;
          saveDraft({
            id: initial.id,
            takenAt,
            rows: state.rows,
            note,
            savedAt: new Date().toISOString(),
          });
          throw err;
        }
        toast({
          text: result === "saved" ? "Reading saved" : "Saved on this device. It will sync later.",
        });
      } else {
        await updateSession(input);
        toast({ text: "Changes saved" });
      }
      setSaved(true);
      setTimeout(leave, 650);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirm(null);
    setSaving(true);
    try {
      await deleteSession(initial.id);
      toast({
        text: "Reading deleted",
        action: { label: "Undo", run: () => restoreSession(initial.id) },
      });
      leave();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const openTime = () => {
    const value = formatLocalDateTimeInput(toLocal(new Date(takenAt)));
    setTimeValue(value);
    setTimeOpenedWith({ value, at: Date.now() });
    setTimeOpen(true);
  };
  let timeError: string | null = null;
  let parsedTime: string | null = null;
  if (timeOpen) {
    try {
      const instant = fromLocal(parseLocalDateTimeInput(timeValue));
      if (instant.getTime() > timeOpenedWith.at + 5 * 60_000)
        timeError = "The time can't be in the future";
      else parsedTime = instant.toISOString();
    } catch (err) {
      timeError = err instanceof Error ? err.message : "Invalid time";
    }
  }

  const toggleSuggestion = (text: string) => {
    const parts = note
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p !== "");
    const next = parts.includes(text) ? parts.filter((p) => p !== text) : [...parts, text];
    setNote(next.join(", "));
  };

  const activeRow = step.kind === "reading" ? state.rows[step.index] : undefined;
  const nextActionLabel =
    step.kind !== "reading" || activeRow === undefined
      ? ""
      : step.field !== "heartRate"
        ? "Next"
        : activeRow.heartRate === ""
          ? "Skip pulse"
          : "Done";

  return (
    <div className="entry">
      <header className="entry-header">
        <button type="button" className="icon-button" aria-label="Close" onClick={close}>
          <X size={24} aria-hidden="true" />
        </button>
        <div className="entry-heading">
          <span className="entry-title">{mode === "new" ? "New reading" : "Edit reading"}</span>
          <button type="button" className="time-chip" onClick={openTime}>
            <PeriodIcon takenAt={new Date(takenAt)} size={14} />
            {formatTakenAt(takenAt)}
          </button>
        </div>
        <span className="icon-button-spacer" />
      </header>

      {showRestored && onStartOver !== null && (
        <div className="entry-notice">
          Picked up where you left off.
          <button
            type="button"
            onClick={() => {
              setShowRestored(false);
              onStartOver();
            }}
          >
            Start over
          </button>
        </div>
      )}

      {step.kind !== "review" && (
        <ol className="reading-progress" aria-label="Readings">
          {state.rows.map((row, i) => {
            const current =
              (step.kind === "reading" && step.index === i) ||
              (step.kind === "rest" && step.nextIndex === i);
            const done = parseRow(row).ok && !current;
            return (
              <li key={i} className={current ? "current" : done ? "done" : undefined}>
                <span className="sr-only">
                  Reading {i + 1}
                  {current ? " (current)" : done ? " (done)" : ""}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {step.kind === "reading" && activeRow !== undefined && (
        <div className="entry-reading">
          <p className="entry-step-label">
            Reading {step.index + 1} of {state.rows.length}
          </p>
          <ReadingDisplay
            row={activeRow}
            activeField={step.field}
            onFocus={(field) => {
              dispatch({ type: "focus", field });
            }}
          />
          <div className="entry-feedback" aria-live="polite">
            {state.error !== null ? (
              <span className="entry-error">{state.error}</span>
            ) : step.index === 0 && isRowEmpty(activeRow) && mode === "new" ? (
              <span className="entry-tip">
                Sit upright with your back supported and your arm resting at heart height.
              </span>
            ) : (
              (() => {
                const parsed = parseRow(activeRow);
                return parsed.ok
                  ? readingWarnings(parsed.reading).map((w) => (
                      <span key={w} className="entry-warning">
                        {WARNING_MESSAGES[w]}
                      </span>
                    ))
                  : null;
              })()
            )}
          </div>
          <div className="entry-controls">
            <div className="entry-actions">
              {state.returnToReview && state.rows.length > 1 ? (
                <button
                  type="button"
                  className="button plain destructive-text"
                  onClick={() => {
                    dispatch({ type: "remove-reading", index: step.index });
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
                {nextActionLabel}
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
      )}

      {step.kind === "rest" && (
        <div className="entry-rest">
          {(() => {
            const previous = parsedRows[step.nextIndex - 1];
            return (
              previous?.ok === true && (
                <button
                  type="button"
                  className="rest-previous"
                  onClick={() => {
                    dispatch({ type: "edit-reading", index: step.nextIndex - 1 });
                  }}
                >
                  <Check size={16} aria-hidden="true" /> Reading {step.nextIndex}:{" "}
                  <span className="rounded-nums">{readingSummary(previous.reading)}</span>
                  <span className="rest-edit">Edit</span>
                </button>
              )
            );
          })()}
          <RestTimer
            endsAt={step.endsAt}
            totalSeconds={restSeconds}
            nextLabel={`Reading ${String(step.nextIndex + 1)}`}
            onDone={() => {
              dispatch({ type: "rest-done" });
            }}
          />
        </div>
      )}

      {step.kind === "review" && (
        <div className="entry-review">
          {average !== null && (
            <div className="review-hero">
              <span className="review-label">
                {readings.length === 1
                  ? "Reading"
                  : `Average of ${String(readings.length)} readings`}
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
            {state.rows.length < MAX_READINGS_PER_SESSION && (
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
            <button type="button" className="list-row interactive" onClick={openTime}>
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
                setNote(e.target.value);
              }}
            />
            <div className="chips">
              {NOTE_SUGGESTIONS.map((text) => (
                <button
                  key={text}
                  type="button"
                  className="chip"
                  aria-pressed={note.split(",").some((p) => p.trim() === text)}
                  onClick={() => {
                    toggleSuggestion(text);
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
              disabled={saving || readings.length !== state.rows.length}
              onClick={() => void save()}
            >
              {mode === "new" ? "Save reading" : "Save changes"}
            </button>
            {mode === "edit" && (
              <button
                type="button"
                className="button block plain destructive-text"
                disabled={saving}
                onClick={() => {
                  setConfirm("delete");
                }}
              >
                Delete reading
              </button>
            )}
          </div>
        </div>
      )}

      <Sheet
        open={timeOpen}
        onClose={() => {
          setTimeOpen(false);
        }}
        title="When was this taken?"
      >
        <input
          type="datetime-local"
          className="time-input"
          aria-label="Time taken"
          value={timeValue}
          max={formatLocalDateTimeInput(toLocal(new Date(timeOpenedWith.at)))}
          onChange={(e) => {
            setTimeValue(e.target.value);
          }}
        />
        {timeError !== null && <p className="entry-error">{timeError}</p>}
        <div className="sheet-actions">
          <button
            type="button"
            className="button block primary"
            disabled={parsedTime === null}
            onClick={() => {
              // Re-parsing an untouched value would drop seconds, and could pick the other
              // instant of an hour repeated by the autumn clock change.
              if (parsedTime !== null && timeValue !== timeOpenedWith.value) {
                setTakenAt(parsedTime);
                timeEdited.current = true;
              }
              setTimeOpen(false);
            }}
          >
            Done
          </button>
          <button
            type="button"
            className="button block plain"
            onClick={() => {
              setTimeValue(formatLocalDateTimeInput(toLocal(new Date())));
            }}
          >
            Use current time
          </button>
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirm === "discard"}
        title={mode === "new" ? "Discard this reading?" : "Discard your changes?"}
        message={
          mode === "new"
            ? "The values you've entered will be lost."
            : "The reading will stay as it was."
        }
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          setConfirm(null);
          clearDraft();
          leave();
        }}
        onCancel={() => {
          setConfirm(null);
        }}
      />
      <ConfirmSheet
        open={confirm === "delete"}
        title="Delete this reading?"
        message="You can undo this straight afterwards."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void remove()}
        onCancel={() => {
          setConfirm(null);
        }}
      />

      {saved && (
        <div className="saved-overlay" role="status">
          <svg viewBox="0 0 52 52" className="saved-check" aria-hidden="true">
            <circle cx="26" cy="26" r="24" />
            <path d="M15 27l7 7 15-15" />
          </svg>
          <span className="sr-only">Saved</span>
        </div>
      )}
    </div>
  );
}
