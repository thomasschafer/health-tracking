import { z } from "zod";
import {
  instantSchema,
  MAX_NOTE_LENGTH,
  MAX_READINGS_PER_SESSION,
  sessionIdSchema,
} from "../../../../shared/bp.ts";
import type { RowDraft } from "./model.ts";

const STORAGE_KEY = "health.bp.draft.v1";
/** Older drafts are probably abandoned, and their time would be misleading. */
const MAX_DRAFT_AGE_MS = 12 * 3_600_000;

const digits = z.string().regex(/^\d{0,3}$/);
const draftSchema = z
  .object({
    id: sessionIdSchema,
    takenAt: instantSchema,
    rows: z
      .array(z.object({ systolic: digits, diastolic: digits, heartRate: digits }).strict())
      .min(1)
      .max(MAX_READINGS_PER_SESSION),
    note: z.string().max(MAX_NOTE_LENGTH),
    savedAt: instantSchema,
  })
  .strict();

export interface Draft {
  id: string;
  takenAt: string;
  rows: RowDraft[];
  note: string;
  savedAt: string;
}

/** An unsaved new reading, kept so it survives the app being closed or reloaded mid-entry. */
export function loadDraft(now: Date): Draft | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  let parsed: z.infer<typeof draftSchema>;
  try {
    parsed = draftSchema.parse(JSON.parse(raw));
  } catch (err) {
    console.error("Discarding unreadable draft", err);
    clearDraft();
    return null;
  }
  if (now.getTime() - new Date(parsed.savedAt).getTime() > MAX_DRAFT_AGE_MS) {
    clearDraft();
    return null;
  }
  return parsed;
}

export function saveDraft(draft: Draft): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draftSchema.parse(draft)));
}

export function clearDraft(): void {
  localStorage.removeItem(STORAGE_KEY);
}
