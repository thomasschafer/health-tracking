import { createHash } from "node:crypto";
import {
  averageReadings,
  bpSessionInputSchema,
  periodOf,
  type Reading,
  type ValidBpSessionInput,
} from "../src/shared/bp.ts";
import { addDaysToDateKey, fromLocal } from "../src/shared/time.ts";

/**
 * Parses the "Data" tab of the original Google Sheet, exported as CSV.
 *
 * The sheet has one row per AM/PM slot. The date is only on AM rows, and each slot has a time,
 * a pre-computed average and up to three systolic/diastolic pairs. Anything that doesn't fit
 * that shape exactly is reported as an issue for a human to resolve, never guessed at.
 */

export interface ImportIssue {
  /** 1-based row number in the CSV, matching the sheet's row number. */
  row: number;
  date: string | null;
  label: string;
  problem: string;
  cells: string[];
}

export interface Resolution {
  row: number;
  /** "skip" drops the row; otherwise the corrected 24-hour time, slot and/or readings to use. */
  action: "skip" | "fix";
  time?: string;
  /** For readings typed into the wrong slot, e.g. an evening reading in the AM row. */
  label?: "AM" | "PM";
  readings?: { systolic: number; diastolic: number }[];
}

export interface ParseResult {
  sessions: ValidBpSessionInput[];
  issues: ImportIssue[];
  emptySlots: number;
  summary: { label: string; sheetValue: number }[];
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error("Unterminated quoted field in CSV");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const EXPECTED_HEADER = [
  ["Averages"],
  ["Systolic", "AM"],
  ["Diastolic", "AM"],
  ["Systolic", "PM"],
  ["Diastolic", "PM"],
  ["Date", "Time", "", "Average", "", "1", "", "2", "", "3"],
  [
    "",
    "",
    "",
    "Systolic",
    "Diastolic",
    "Systolic",
    "Diastolic",
    "Systolic",
    "Diastolic",
    "Systolic",
    "Diastolic",
    "Datetime",
    "Avg Systolic AM",
    "Avg Diastolic AM",
    "Avg Systolic PM",
    "Avg Diastolic PM",
  ],
];
const HEADER_ROWS = EXPECTED_HEADER.length;
const COLUMN_COUNT = 16;

/** Deterministic, so re-running the import recognises sessions it has already imported. */
export function importSessionId(date: string, label: string): string {
  const hex = createHash("sha256").update(`sheet-import:${date}:${label}`).digest("hex");
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function parseSheetDate(value: string): string | null {
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(value);
  if (match === null) return null;
  const [, y, m, d] = match as unknown as [string, string, string, string];
  const key = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  // Round-tripping rejects impossible dates such as 2023/2/30.
  return addDaysToDateKey(key, 0) === key ? key : null;
}

function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

const isInt = (value: string): boolean => /^\d+$/.test(value);

export function parseSheet(text: string, resolutions: readonly Resolution[] = []): ParseResult {
  const rows = parseCsv(text).map((r) => {
    if (r.length !== COLUMN_COUNT) {
      throw new Error(
        `Expected ${String(COLUMN_COUNT)} columns, found a row with ${String(r.length)}`,
      );
    }
    return r;
  });

  EXPECTED_HEADER.forEach((expected, i) => {
    const actual = rows[i];
    if (actual === undefined) throw new Error("CSV ends inside the header");
    const prefix = i >= 1 && i <= 4 ? actual.slice(0, 2) : actual.slice(0, expected.length);
    if (JSON.stringify(prefix) !== JSON.stringify(expected)) {
      throw new Error(
        `Header row ${String(i + 1)} doesn't match the expected layout: ${JSON.stringify(actual)}`,
      );
    }
  });
  const summary = rows.slice(1, 5).map((r) => ({
    label: `${r[0] ?? ""} ${r[1] ?? ""}`,
    sheetValue: Number(r[2]),
  }));

  const resolutionByRow = new Map(resolutions.map((r) => [r.row, r]));
  const sessions: ValidBpSessionInput[] = [];
  const issues: ImportIssue[] = [];
  let emptySlots = 0;
  let currentDate: string | null = null;

  rows.slice(HEADER_ROWS).forEach((cells, index) => {
    const rowNumber = HEADER_ROWS + index + 1;
    const [dateCell = "", sheetLabel = "", timeCell = "", avgSys = "", avgDia = ""] = cells;
    const pairCells = cells.slice(5, 11);
    const issue = (problem: string) => {
      issues.push({ row: rowNumber, date: currentDate, label: sheetLabel, problem, cells });
    };

    if (sheetLabel === "AM") {
      const date = parseSheetDate(dateCell);
      if (date === null) {
        currentDate = null;
        issue(`AM row has an unreadable date "${dateCell}"`);
        return;
      }
      if (currentDate !== null && date !== addDaysToDateKey(currentDate, 1)) {
        throw new Error(`Row ${String(rowNumber)}: date ${date} doesn't follow ${currentDate}`);
      }
      currentDate = date;
    } else if (sheetLabel === "PM") {
      if (dateCell !== "") {
        issue(`PM row unexpectedly has a date "${dateCell}"`);
        return;
      }
    } else {
      issue(`Unexpected AM/PM label "${sheetLabel}"`);
      return;
    }
    if (currentDate === null) {
      issue("Row has no date to belong to");
      return;
    }

    const resolution = resolutionByRow.get(rowNumber);
    resolutionByRow.delete(rowNumber);
    if (resolution?.action === "skip") return;
    const label = resolution?.label ?? sheetLabel;

    const hasData = [timeCell, avgSys, avgDia, ...pairCells].some((c) => c !== "");
    if (!hasData && resolution === undefined) {
      emptySlots++;
      return;
    }

    const readings: Reading[] = [];
    if (resolution?.readings !== undefined) {
      readings.push(...resolution.readings.map((r) => ({ ...r, heartRate: null })));
    } else {
      for (let p = 0; p < 3; p++) {
        const sys = pairCells[p * 2] ?? "";
        const dia = pairCells[p * 2 + 1] ?? "";
        if (sys === "" && dia === "") continue;
        if (!isInt(sys) || !isInt(dia)) {
          issue(
            `Reading ${String(p + 1)} is incomplete or not a whole number ("${sys}", "${dia}")`,
          );
          return;
        }
        if (readings.length !== p) {
          issue(`Reading ${String(p + 1)} follows an empty reading`);
          return;
        }
        readings.push({ systolic: Number(sys), diastolic: Number(dia), heartRate: null });
      }
    }
    if (readings.length === 0) {
      issue("Row has a time or average but no readings");
      return;
    }

    if (resolution?.readings === undefined) {
      const avg = averageReadings(readings);
      if (
        Math.abs(Number(avgSys) - avg.systolic) > 0.006 ||
        Math.abs(Number(avgDia) - avg.diastolic) > 0.006
      ) {
        issue(
          `Sheet average ${avgSys}/${avgDia} doesn't match the readings (${avg.systolic.toFixed(2)}/${avg.diastolic.toFixed(2)})`,
        );
        return;
      }
    }

    const time = parseTime(resolution?.time ?? timeCell);
    if (time === null) {
      issue(timeCell === "" ? "Row has readings but no time" : `Unreadable time "${timeCell}"`);
      return;
    }
    // Late-evening readings taken after midnight are filed under the previous day's PM slot.
    const calendarDate =
      label === "PM" && time.hour < 3 ? addDaysToDateKey(currentDate, 1) : currentDate;
    const [y, m, d] = calendarDate.split("-").map(Number) as [number, number, number];
    let takenAt: Date;
    try {
      takenAt = fromLocal({ year: y, month: m, day: d, ...time });
    } catch (err) {
      issue(err instanceof Error ? err.message : String(err));
      return;
    }
    const expectedPeriod = label === "AM" ? "morning" : "evening";
    if (periodOf(takenAt) !== expectedPeriod) {
      issue(`Time ${resolution?.time ?? timeCell} doesn't look like a ${label} reading`);
      return;
    }

    const parsed = bpSessionInputSchema.safeParse({
      id: importSessionId(currentDate, label),
      takenAt: takenAt.toISOString(),
      note: null,
      readings,
    });
    if (!parsed.success) {
      issue(parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    sessions.push(parsed.data);
  });

  const ids = new Set(sessions.map((s) => s.id));
  if (ids.size !== sessions.length) {
    throw new Error("Two rows resolve to the same day and slot");
  }
  if (resolutionByRow.size > 0) {
    throw new Error(
      `Resolutions refer to rows that aren't in the sheet: ${[...resolutionByRow.keys()].join(", ")}`,
    );
  }
  return { sessions, issues, emptySlots, summary };
}
