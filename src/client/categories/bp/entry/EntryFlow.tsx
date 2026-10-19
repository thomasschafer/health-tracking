import { X } from "lucide-react";
import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { BpSessionInput } from "../../../../shared/bp.ts";
import { useData } from "../../../data.tsx";
import { ConfirmSheet } from "../../../ui/Sheet.tsx";
import { useToast } from "../../../ui/Toast.tsx";
import { PeriodIcon } from "../SessionRow.tsx";
import { clearDraft } from "./draft.ts";
import { formatTakenAt } from "./format.ts";
import {
  persistDraft,
  useCurrentTimeUntilEdited,
  useDraftAutosave,
  useKeyboardEntry,
} from "./hooks.ts";
import {
  entryReducer,
  isRowEmpty,
  parseRow,
  type EntryAction,
  type EntryState,
  type RowDraft,
} from "./model.ts";
import { ReadingProgress } from "./ReadingProgress.tsx";
import { ReadingStep } from "./ReadingStep.tsx";
import { RestStep } from "./RestStep.tsx";
import { ReviewStep } from "./ReviewStep.tsx";
import { TimeSheet } from "./TimeSheet.tsx";

export interface EntryInitial {
  id: string;
  takenAt: string;
  rows: RowDraft[];
  note: string;
}

/**
 * Entering or editing a session: one reading at a time on the keypad, with optional rests in
 * between, then a review before saving. The step logic lives in model.ts.
 */
export function EntryFlow({
  mode,
  initial,
  restored,
  restSeconds,
  onStartOver,
}: {
  mode: "new" | "edit";
  initial: EntryInitial;
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
  const timeEdited = useRef(false);
  const [confirm, setConfirm] = useState<"discard" | "delete" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showRestored, setShowRestored] = useState(restored);
  const handedOver = useRef(false);

  const hasData = state.rows.some((r) => !isRowEmpty(r)) || note.trim() !== "";
  const dirty =
    JSON.stringify({ rows: state.rows, note, takenAt }) !==
    JSON.stringify({ rows: initial.rows, note: initial.note, takenAt: initial.takenAt });
  const draft = { id: initial.id, takenAt, rows: state.rows, note };

  useCurrentTimeUntilEdited(mode === "new", hasData, timeEdited, setTakenAt);
  useDraftAutosave(mode === "new", hasData, draft, handedOver);
  useKeyboardEntry(state.step.kind, dispatch);

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

  const readings = state.rows.map(parseRow).flatMap((r) => (r.ok ? [r.reading] : []));

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
        handedOver.current = true;
        clearDraft();
        let result: Awaited<ReturnType<typeof addSession>>;
        try {
          result = await addSession(input);
        } catch (err) {
          handedOver.current = false;
          persistDraft(draft);
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
    setTimeOpen(true);
  };
  const { step } = state;

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

      {step.kind !== "review" && <ReadingProgress rows={state.rows} step={step} />}

      {step.kind === "reading" && (
        <ReadingStep
          state={state}
          index={step.index}
          field={step.field}
          isNewSession={mode === "new"}
          dispatch={dispatch}
        />
      )}

      {step.kind === "rest" && (
        <RestStep
          rows={state.rows}
          nextIndex={step.nextIndex}
          endsAt={step.endsAt}
          restSeconds={restSeconds}
          dispatch={dispatch}
        />
      )}

      {step.kind === "review" && (
        <ReviewStep
          readings={readings}
          rowCount={state.rows.length}
          takenAt={takenAt}
          note={note}
          mode={mode}
          saving={saving}
          saveError={saveError}
          dispatch={dispatch}
          onEditTime={openTime}
          onNoteChange={setNote}
          onSave={() => void save()}
          onDelete={() => {
            setConfirm("delete");
          }}
        />
      )}

      {timeOpen && (
        <TimeSheet
          takenAt={takenAt}
          onClose={() => {
            setTimeOpen(false);
          }}
          onChange={(next) => {
            setTakenAt(next);
            timeEdited.current = true;
          }}
        />
      )}

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
