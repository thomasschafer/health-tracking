import { READING_LIMITS, readingSchema, type Reading } from "../../../../shared/bp.ts";

export type FieldName = keyof Reading;
export const FIELDS: readonly FieldName[] = ["systolic", "diastolic", "heartRate"];

export const FIELD_LABELS: Record<FieldName, string> = {
  systolic: "Systolic",
  diastolic: "Diastolic",
  heartRate: "Pulse",
};

export type RowDraft = Record<FieldName, string>;

export const emptyRow = (): RowDraft => ({ systolic: "", diastolic: "", heartRate: "" });

export const rowFromReading = (r: Reading): RowDraft => ({
  systolic: String(r.systolic),
  diastolic: String(r.diastolic),
  heartRate: r.heartRate === null ? "" : String(r.heartRate),
});

export const isRowEmpty = (row: RowDraft): boolean => FIELDS.every((f) => row[f] === "");

export type RowResult =
  { ok: true; reading: Reading } | { ok: false; errors: Partial<Record<FieldName, string>> };

export function parseRow(row: RowDraft): RowResult {
  const toNumber = (value: string) => (value === "" ? undefined : Number(value));
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

/** True once another digit would make the value too large to be valid. */
export const isComplete = (value: string, field: FieldName): boolean =>
  value !== "" && Number(`${value}0`) > READING_LIMITS[field].max;

export const MAX_DIGITS = 3;

export type Step =
  | { kind: "reading"; index: number; field: FieldName }
  | { kind: "rest"; nextIndex: number; endsAt: number }
  | { kind: "review" };

export interface EntryState {
  rows: RowDraft[];
  step: Step;
  /** Set while correcting a single reading from the review step, which is returned to afterwards. */
  returnToReview: boolean;
  /** Validation message for the reading being entered. */
  error: string | null;
  /** Set when a field is chosen directly, so the next digit replaces its value rather than appending. */
  replace: boolean;
}

export type EntryAction =
  | { type: "digit"; digit: string }
  | { type: "backspace" }
  | { type: "next" }
  | { type: "focus"; field: FieldName }
  | { type: "edit-reading"; index: number }
  | { type: "add-reading" }
  | { type: "remove-reading"; index: number }
  | { type: "rest-done" };

export interface EntryConfig {
  restSeconds: number;
  now: () => number;
}

function nextField(field: FieldName): FieldName | null {
  return FIELDS[FIELDS.indexOf(field) + 1] ?? null;
}

function previousField(field: FieldName): FieldName | null {
  const i = FIELDS.indexOf(field);
  return i > 0 ? (FIELDS[i - 1] ?? null) : null;
}

function rowAt(state: EntryState, index: number): RowDraft {
  const row = state.rows[index];
  if (row === undefined) throw new Error(`No reading at index ${String(index)}`);
  return row;
}

const reading = (index: number, field: FieldName): Step => ({ kind: "reading", index, field });

/** Validates the current reading and moves to the rest timer, the next reading or the review. */
function finishReading(state: EntryState, index: number, config: EntryConfig): EntryState {
  const parsed = parseRow(rowAt(state, index));
  if (!parsed.ok) {
    const field = FIELDS.find((f) => parsed.errors[f] !== undefined) ?? "systolic";
    return {
      ...state,
      step: reading(index, field),
      error: parsed.errors[field] ?? "Check this reading",
      replace: true,
    };
  }
  const done = { ...state, error: null, replace: false };
  if (state.returnToReview) return { ...done, step: { kind: "review" }, returnToReview: false };
  const nextIndex = index + 1;
  if (nextIndex >= state.rows.length) return { ...done, step: { kind: "review" } };
  if (config.restSeconds > 0) {
    return {
      ...done,
      step: { kind: "rest", nextIndex, endsAt: config.now() + config.restSeconds * 1000 },
    };
  }
  return { ...done, step: reading(nextIndex, "systolic") };
}

export function entryReducer(
  state: EntryState,
  action: EntryAction,
  config: EntryConfig,
): EntryState {
  const { step } = state;
  switch (action.type) {
    case "digit": {
      if (step.kind !== "reading") return state;
      if (!/^\d$/.test(action.digit)) throw new Error(`Not a digit: ${action.digit}`);
      const current = state.replace ? "" : rowAt(state, step.index)[step.field];
      if (current === "" && action.digit === "0") return state;
      const value = current + action.digit;
      if (value.length > MAX_DIGITS || Number(value) > READING_LIMITS[step.field].max) return state;
      const rows = state.rows.map((r, i) => (i === step.index ? { ...r, [step.field]: value } : r));
      const updated = { ...state, rows, error: null, replace: false };
      if (!isComplete(value, step.field)) return updated;
      const next = nextField(step.field);
      return next === null
        ? finishReading(updated, step.index, config)
        : { ...updated, step: reading(step.index, next) };
    }
    case "backspace": {
      if (step.kind !== "reading") return state;
      if (rowAt(state, step.index)[step.field] === "") {
        const previous = previousField(step.field);
        return previous === null
          ? state
          : { ...state, step: reading(step.index, previous), error: null, replace: false };
      }
      const rows = state.rows.map((r, i) =>
        i === step.index ? { ...r, [step.field]: r[step.field].slice(0, -1) } : r,
      );
      return { ...state, rows, error: null, replace: false };
    }
    case "next": {
      if (step.kind !== "reading") return state;
      const next = nextField(step.field);
      return next === null
        ? finishReading(state, step.index, config)
        : { ...state, step: reading(step.index, next), replace: false };
    }
    case "focus":
      return step.kind === "reading"
        ? { ...state, step: reading(step.index, action.field), replace: true }
        : state;
    case "edit-reading":
      if (action.index < 0 || action.index >= state.rows.length) throw new Error("No such reading");
      return {
        ...state,
        step: reading(action.index, "systolic"),
        returnToReview: true,
        error: null,
        replace: true,
      };
    case "add-reading":
      return {
        ...state,
        rows: [...state.rows, emptyRow()],
        step: reading(state.rows.length, "systolic"),
        returnToReview: true,
        error: null,
        replace: false,
      };
    case "remove-reading": {
      if (state.rows.length <= 1) return state;
      const rows = state.rows.filter((_, i) => i !== action.index);
      return {
        ...state,
        rows,
        step: { kind: "review" },
        returnToReview: false,
        error: null,
        replace: false,
      };
    }
    case "rest-done":
      return step.kind === "rest"
        ? { ...state, step: reading(step.nextIndex, "systolic"), replace: false }
        : state;
  }
}
