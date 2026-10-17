import { averageReadings, periodOf, sessionDayKey, type BpSession } from "../shared/bp.ts";
import { formatTime } from "../shared/time.ts";

const CSV_HEADER = [
  "session_id",
  "day",
  "local_time",
  "period",
  "taken_at_utc",
  "reading",
  "systolic",
  "diastolic",
  "heart_rate",
  "session_avg_systolic",
  "session_avg_diastolic",
  "note",
] as const;

function csvField(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One row per reading, so the export is lossless and opens directly in a spreadsheet. */
export function sessionsToCsv(sessions: readonly BpSession[]): string {
  const rows = sessions.flatMap((s) => {
    const takenAt = new Date(s.takenAt);
    const avg = averageReadings(s.readings);
    return s.readings.map((r, i) => [
      s.id,
      sessionDayKey(takenAt),
      formatTime(takenAt),
      periodOf(takenAt),
      s.takenAt,
      i + 1,
      r.systolic,
      r.diastolic,
      r.heartRate,
      avg.systolic.toFixed(2),
      avg.diastolic.toFixed(2),
      s.note,
    ]);
  });
  return [CSV_HEADER, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}
