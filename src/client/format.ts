import { type BpAverage, type BpCategory, type Period } from "../shared/bp.ts";

export const formatBp = (avg: Pick<BpAverage, "systolic" | "diastolic">): string =>
  `${String(Math.round(avg.systolic))}/${String(Math.round(avg.diastolic))}`;

export interface StatusStyle {
  label: string;
  color: string;
  tint: string;
}

export const BP_STATUS: Record<BpCategory, StatusStyle> = {
  low: { label: "Low", color: "var(--status-warning)", tint: "var(--warning-tint)" },
  normal: { label: "Normal", color: "var(--status-good)", tint: "var(--good-tint)" },
  stage1: {
    label: "Stage 1 hypertension",
    color: "var(--status-warning)",
    tint: "var(--warning-tint)",
  },
  stage2: {
    label: "Stage 2 hypertension",
    color: "var(--status-serious)",
    tint: "var(--warning-tint)",
  },
  severe: {
    label: "Severe hypertension",
    color: "var(--status-critical)",
    tint: "var(--critical-tint)",
  },
};

export const PERIOD_LABELS: Record<Period, string> = { morning: "Morning", evening: "Evening" };

const relative = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

export function formatAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  if (Math.abs(minutes) < 1) return "just now";
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return relative.format(days, "day");
  const months = Math.round(days / 30.44);
  if (Math.abs(months) < 12) return relative.format(months, "month");
  return relative.format(Math.round(days / 365.25), "year");
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const dayYearFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const monthFormat = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortDayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const keyDate = (key: string) => new Date(`${key}T12:00:00Z`);

/** Formats a YYYY-MM-DD key, e.g. "Sat 17 Oct". */
export const formatDayKey = (key: string): string => dayFormat.format(keyDate(key));
export const formatDayKeyWithYear = (key: string): string => dayYearFormat.format(keyDate(key));
export const formatMonthKey = (key: string): string => monthFormat.format(keyDate(key));
export const formatShortDayKey = (key: string): string => shortDayFormat.format(keyDate(key));

export function formatRelativeDayKey(key: string, today: string): string {
  const diff = Math.round((keyDate(today).getTime() - keyDate(key).getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return key.slice(0, 4) === today.slice(0, 4) ? formatDayKey(key) : formatDayKeyWithYear(key);
}
