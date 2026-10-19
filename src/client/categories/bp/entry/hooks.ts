import { useEffect, useRef, type Dispatch, type RefObject } from "react";
import { clearDraft, saveDraft } from "./draft.ts";
import type { EntryAction, RowDraft, Step } from "./model.ts";

/** Lets a hardware keyboard drive the keypad while a reading is being entered. */
export function useKeyboardEntry(stepKind: Step["kind"], dispatch: Dispatch<EntryAction>): void {
  useEffect(() => {
    if (stepKind !== "reading") return;
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
  }, [stepKind, dispatch]);
}

interface DraftContent {
  id: string;
  takenAt: string;
  rows: RowDraft[];
  note: string;
}

export const persistDraft = (draft: DraftContent): void => {
  saveDraft({ ...draft, savedAt: new Date().toISOString() });
};

/**
 * Keeps an unsaved new reading as a draft, so it survives the app closing. `saved` stops this
 * once the reading has been handed over for saving.
 */
export function useDraftAutosave(
  enabled: boolean,
  hasData: boolean,
  draft: DraftContent,
  saved: RefObject<boolean>,
): void {
  const { id, takenAt, rows, note } = draft;
  useEffect(() => {
    if (!enabled || saved.current) return;
    if (hasData) persistDraft({ id, takenAt, rows, note });
    else clearDraft();
  }, [enabled, hasData, id, takenAt, rows, note, saved]);
}

/**
 * The app may be left open on the entry screen and resumed hours later. Until something has
 * been entered or the time chosen by hand, keep the time current so the reading isn't filed at
 * the wrong time of day.
 */
export function useCurrentTimeUntilEdited(
  enabled: boolean,
  hasData: boolean,
  timeEdited: RefObject<boolean>,
  setTakenAt: (takenAt: string) => void,
): void {
  const hasDataRef = useRef(hasData);
  useEffect(() => {
    hasDataRef.current = hasData;
  }, [hasData]);
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && !hasDataRef.current && !timeEdited.current) {
        setTakenAt(new Date().toISOString());
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, timeEdited, setTakenAt]);
}
