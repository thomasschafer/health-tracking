import { z } from "zod";
import { addDaysToDateKey, localDateKey, toLocal } from "./time.ts";

export const READING_LIMITS = {
  systolic: { min: 50, max: 300 },
  diastolic: { min: 20, max: 200 },
  heartRate: { min: 20, max: 250 },
} as const;

export const MAX_READINGS_PER_SESSION = 5;
export const DEFAULT_READINGS_PER_SESSION = 3;
export const MAX_NOTE_LENGTH = 2000;

const boundedInt = (label: string, { min, max }: { min: number; max: number }) =>
  z
    .number({ error: `${label} is required` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${String(min)}`)
    .max(max, `${label} must be at most ${String(max)}`);

export const readingSchema = z
  .object({
    systolic: boundedInt("Systolic", READING_LIMITS.systolic),
    diastolic: boundedInt("Diastolic", READING_LIMITS.diastolic),
    heartRate: boundedInt("Heart rate", READING_LIMITS.heartRate).nullable(),
  })
  .strict()
  .refine((r) => r.systolic > r.diastolic, {
    message: "Systolic must be higher than diastolic",
    path: ["diastolic"],
  });
export type Reading = z.infer<typeof readingSchema>;

/** An instant serialised as a UTC ISO-8601 string with milliseconds, e.g. 2026-10-17T20:05:00.000Z. */
export const instantSchema = z.iso
  .datetime({ precision: 3 })
  .refine((s) => new Date(s).toISOString() === s, "Must be a normalised UTC timestamp");

export const sessionIdSchema = z.uuid();

export const bpSessionInputSchema = z
  .object({
    id: sessionIdSchema,
    takenAt: instantSchema,
    note: z
      .string()
      .max(MAX_NOTE_LENGTH)
      .nullable()
      .transform((n) => (n === null || n.trim() === "" ? null : n.trim())),
    readings: z.array(readingSchema).min(1).max(MAX_READINGS_PER_SESSION),
  })
  .strict();
export type BpSessionInput = z.input<typeof bpSessionInputSchema>;
export type ValidBpSessionInput = z.output<typeof bpSessionInputSchema>;

/**
 * A stored session as the server returns it. Unlike the input schemas, unknown keys are dropped
 * rather than rejected: the phone can be running an older cached version of the app than the
 * server, and must keep working when the server starts returning new fields.
 */
export const bpSessionSchema = z.object({
  id: sessionIdSchema,
  takenAt: instantSchema,
  note: z.string().nullable(),
  readings: z.array(readingSchema.strip()).min(1).max(MAX_READINGS_PER_SESSION),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type BpSession = z.infer<typeof bpSessionSchema>;

export interface BpAverage {
  systolic: number;
  diastolic: number;
  /** Null when no reading in the group recorded a heart rate. */
  heartRate: number | null;
}

const mean = (values: readonly number[]): number => {
  if (values.length === 0) {
    throw new Error("Cannot average an empty list");
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
};

export function averageReadings(readings: readonly Reading[]): BpAverage {
  const heartRates = readings.flatMap((r) => (r.heartRate === null ? [] : [r.heartRate]));
  return {
    systolic: mean(readings.map((r) => r.systolic)),
    diastolic: mean(readings.map((r) => r.diastolic)),
    heartRate: heartRates.length === 0 ? null : mean(heartRates),
  };
}

/** Averages session averages, so each session counts equally regardless of how many readings it has. */
export function averageSessions(
  sessions: readonly Pick<BpSession, "readings">[],
): BpAverage | null {
  if (sessions.length === 0) {
    return null;
  }
  const averages = sessions.map((s) => averageReadings(s.readings));
  const heartRates = averages.flatMap((a) => (a.heartRate === null ? [] : [a.heartRate]));
  return {
    systolic: mean(averages.map((a) => a.systolic)),
    diastolic: mean(averages.map((a) => a.diastolic)),
    heartRate: heartRates.length === 0 ? null : mean(heartRates),
  };
}

export type Period = "morning" | "evening";

/** Morning is 03:00–11:59 local time; anything else (including after midnight) is evening. */
export function periodOf(takenAt: Date): Period {
  const { hour } = toLocal(takenAt);
  return hour >= 3 && hour < 12 ? "morning" : "evening";
}

/**
 * The day a session belongs to. Evening sessions taken after midnight count towards the previous
 * day, matching how a late-night reading is thought of.
 */
export function sessionDayKey(takenAt: Date): string {
  const { hour } = toLocal(takenAt);
  return localDateKey(hour < 3 ? new Date(takenAt.getTime() - 3 * 3_600_000) : takenAt);
}

/**
 * Categories based on NICE home blood pressure monitoring thresholds (NG136). These apply to
 * averages over several days, not to single readings.
 */
export type BpCategory = "low" | "normal" | "stage1" | "stage2" | "severe";

export function categorise(avg: Pick<BpAverage, "systolic" | "diastolic">): BpCategory {
  const { systolic, diastolic } = avg;
  if (systolic >= 180 || diastolic >= 120) return "severe";
  if (systolic >= 150 || diastolic >= 95) return "stage2";
  if (systolic >= 135 || diastolic >= 85) return "stage1";
  if (systolic < 90 || diastolic < 60) return "low";
  return "normal";
}

export const CATEGORY_LABELS: Record<BpCategory, string> = {
  low: "Low",
  normal: "Normal",
  stage1: "Stage 1 hypertension",
  stage2: "Stage 2 hypertension",
  severe: "Severe hypertension",
};

export type ReadingWarning = "very-high" | "low" | "unusual-heart-rate";

/** Plausible but unusual values that deserve a double-check before saving. */
export function readingWarnings(reading: Reading): ReadingWarning[] {
  const warnings: ReadingWarning[] = [];
  if (reading.systolic >= 180 || reading.diastolic >= 120) warnings.push("very-high");
  if (reading.systolic < 90 || reading.diastolic < 60) warnings.push("low");
  if (reading.heartRate !== null && (reading.heartRate < 40 || reading.heartRate > 150)) {
    warnings.push("unusual-heart-rate");
  }
  return warnings;
}

export const WARNING_MESSAGES: Record<ReadingWarning, string> = {
  "very-high": "This reading is very high. Double-check it was entered correctly.",
  low: "This reading is low. Double-check it was entered correctly.",
  "unusual-heart-rate": "This heart rate is unusual. Double-check it was entered correctly.",
};

export interface PeriodSummary {
  sessionCount: number;
  average: BpAverage | null;
}

export interface WindowSummary {
  days: number;
  morning: PeriodSummary;
  evening: PeriodSummary;
  all: PeriodSummary;
}

/** Summarises sessions whose day falls within the last `days` days, including today. */
export function summariseWindow(
  sessions: readonly BpSession[],
  now: Date,
  days: number,
): WindowSummary {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`Window must be a positive whole number of days, got ${String(days)}`);
  }
  const todayKey = sessionDayKey(now);
  const earliestKey = addDaysToDateKey(todayKey, -(days - 1));
  const inWindow = sessions.filter((s) => {
    const key = sessionDayKey(new Date(s.takenAt));
    return key >= earliestKey && key <= todayKey;
  });
  const summarise = (subset: readonly BpSession[]): PeriodSummary => ({
    sessionCount: subset.length,
    average: averageSessions(subset),
  });
  return {
    days,
    morning: summarise(inWindow.filter((s) => periodOf(new Date(s.takenAt)) === "morning")),
    evening: summarise(inWindow.filter((s) => periodOf(new Date(s.takenAt)) === "evening")),
    all: summarise(inWindow),
  };
}
