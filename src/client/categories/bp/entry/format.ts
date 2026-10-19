import type { Reading } from "../../../../shared/bp.ts";
import { formatTime, localDateKey } from "../../../../shared/time.ts";
import { formatRelativeDayKey } from "../../../format.ts";

/** e.g. "Today, 21:05". */
export function formatTakenAt(takenAt: string): string {
  const date = new Date(takenAt);
  return `${formatRelativeDayKey(localDateKey(date), localDateKey(new Date()))}, ${formatTime(date)}`;
}

/** e.g. "128/79 · 62 bpm". */
export function readingSummary(r: Reading): string {
  return `${String(r.systolic)}/${String(r.diastolic)}${r.heartRate === null ? "" : ` · ${String(r.heartRate)} bpm`}`;
}
