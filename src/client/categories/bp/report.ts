import {
  averageReadings,
  averageSessions,
  periodOf,
  sessionDayKey,
  type BpAverage,
  type BpSession,
} from "../../../shared/bp.ts";
import { addDaysToDateKey } from "../../../shared/time.ts";

export interface ReportSummary {
  from: string;
  to: string;
  sessions: BpSession[];
  readingCount: number;
  overall: BpAverage | null;
  morning: { count: number; average: BpAverage | null };
  evening: { count: number; average: BpAverage | null };
  highest: BpSession | null;
  lowest: BpSession | null;
}

const systolicOf = (s: BpSession) => averageReadings(s.readings).systolic;

/** Everything a clinician would want from a period of home readings, oldest first. */
export function buildReport(all: readonly BpSession[], from: string, to: string): ReportSummary {
  if (from > to) throw new Error(`Report range starts after it ends (${from} to ${to})`);
  const sessions = all
    .filter((s) => {
      const day = sessionDayKey(new Date(s.takenAt));
      return day >= from && day <= to;
    })
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const morning = sessions.filter((s) => periodOf(new Date(s.takenAt)) === "morning");
  const evening = sessions.filter((s) => periodOf(new Date(s.takenAt)) === "evening");
  const bySystolic = [...sessions].sort((a, b) => systolicOf(a) - systolicOf(b));
  return {
    from,
    to,
    sessions,
    readingCount: sessions.reduce((n, s) => n + s.readings.length, 0),
    overall: averageSessions(sessions),
    morning: { count: morning.length, average: averageSessions(morning) },
    evening: { count: evening.length, average: averageSessions(evening) },
    highest: bySystolic.at(-1) ?? null,
    lowest: bySystolic[0] ?? null,
  };
}

export const REPORT_PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

export function presetRange(days: number, today: string): { from: string; to: string } {
  return { from: addDaysToDateKey(today, -(days - 1)), to: today };
}
