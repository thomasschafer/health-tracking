import { CATEGORY_LABELS, type BpAverage, type BpCategory } from "../shared/bp.ts";

export const formatBp = (avg: Pick<BpAverage, "systolic" | "diastolic">): string =>
  `${String(Math.round(avg.systolic))}/${String(Math.round(avg.diastolic))}`;

export const CATEGORY_COLORS: Record<BpCategory, string> = {
  low: "var(--status-warning)",
  normal: "var(--status-good)",
  stage1: "var(--status-warning)",
  stage2: "var(--status-serious)",
  severe: "var(--status-critical)",
};

export const categoryLabel = (category: BpCategory): string => CATEGORY_LABELS[category];

const relative = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

export function formatAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}
