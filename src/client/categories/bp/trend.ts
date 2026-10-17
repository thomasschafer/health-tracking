import {
  averageSessions,
  periodOf,
  sessionDayKey,
  type BpAverage,
  type BpSession,
  type Period,
} from "../../../shared/bp.ts";
import { addDaysToDateKey } from "../../../shared/time.ts";

export type PeriodFilter = Period | "all";

export const RANGES = ["W", "M", "6M", "Y", "All"] as const;
export type RangeKey = (typeof RANGES)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
  W: "Week",
  M: "Month",
  "6M": "6 months",
  Y: "Year",
  All: "All time",
};

export type BucketSize = "day" | "week" | "month";

export interface Bucket {
  /** First day in the bucket, YYYY-MM-DD. */
  start: string;
  /** Last day in the bucket, inclusive. */
  end: string;
  sessionCount: number;
  average: BpAverage | null;
}

export interface Trend {
  range: RangeKey;
  bucketSize: BucketSize;
  buckets: Bucket[];
  /** Average over every session in the range, weighting sessions equally. */
  average: BpAverage | null;
  sessionCount: number;
}

const dayNumber = (key: string): number => Date.parse(`${key}T00:00:00Z`) / 86_400_000;

function startOfWeek(key: string): string {
  // Weeks start on Monday. getUTCDay is 0 for Sunday.
  const weekday = new Date(`${key}T00:00:00Z`).getUTCDay();
  return addDaysToDateKey(key, -((weekday + 6) % 7));
}

const startOfMonth = (key: string): string => `${key.slice(0, 7)}-01`;

function nextBucketStart(start: string, size: BucketSize): string {
  switch (size) {
    case "day":
      return addDaysToDateKey(start, 1);
    case "week":
      return addDaysToDateKey(start, 7);
    case "month": {
      const year = Number(start.slice(0, 4));
      const month = Number(start.slice(5, 7));
      return month === 12
        ? `${String(year + 1)}-01-01`
        : `${String(year)}-${String(month + 1).padStart(2, "0")}-01`;
    }
  }
}

function bucketStart(key: string, size: BucketSize): string {
  switch (size) {
    case "day":
      return key;
    case "week":
      return startOfWeek(key);
    case "month":
      return startOfMonth(key);
  }
}

function rangeStart(range: RangeKey, today: string, earliest: string | null): string {
  switch (range) {
    case "W":
      return addDaysToDateKey(today, -6);
    case "M":
      return addDaysToDateKey(today, -29);
    case "6M":
      return startOfWeek(addDaysToDateKey(today, -181));
    case "Y":
      return startOfMonth(addDaysToDateKey(today, -364));
    case "All":
      return earliest ?? today;
  }
}

function bucketSizeFor(range: RangeKey, start: string, today: string): BucketSize {
  switch (range) {
    case "W":
    case "M":
      return "day";
    case "6M":
      return "week";
    case "Y":
      return "month";
    case "All": {
      const days = dayNumber(today) - dayNumber(start);
      return days <= 45 ? "day" : days <= 270 ? "week" : "month";
    }
  }
}

export function buildTrend(
  sessions: readonly BpSession[],
  range: RangeKey,
  period: PeriodFilter,
  today: string,
): Trend {
  const relevant = sessions.filter(
    (s) => period === "all" || periodOf(new Date(s.takenAt)) === period,
  );
  const keyed = relevant.map((s) => ({ session: s, day: sessionDayKey(new Date(s.takenAt)) }));
  const earliest = keyed.reduce<string | null>(
    (min, k) => (min === null || k.day < min ? k.day : min),
    null,
  );
  const start = rangeStart(range, today, earliest);
  const size = bucketSizeFor(range, start, today);
  const inRange = keyed.filter((k) => k.day >= start && k.day <= today);
  const byBucket = Map.groupBy(inRange, (k) => bucketStart(k.day, size));

  const buckets: Bucket[] = [];
  for (
    let cursor = bucketStart(start, size);
    cursor <= today;
    cursor = nextBucketStart(cursor, size)
  ) {
    const members = (byBucket.get(cursor) ?? []).map((k) => k.session);
    const end = addDaysToDateKey(nextBucketStart(cursor, size), -1);
    buckets.push({
      start: cursor,
      end: end > today ? today : end,
      sessionCount: members.length,
      average: averageSessions(members),
    });
  }
  const all = inRange.map((k) => k.session);
  return {
    range,
    bucketSize: size,
    buckets,
    average: averageSessions(all),
    sessionCount: all.length,
  };
}
