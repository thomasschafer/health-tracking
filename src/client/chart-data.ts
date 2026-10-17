import {
  averageSessions,
  periodOf,
  sessionDayKey,
  type BpSession,
  type Period,
} from "../shared/bp.ts";
import { addDaysToDateKey } from "../shared/time.ts";

export type PeriodFilter = Period | "all";

export interface DailyPoint {
  /** YYYY-MM-DD in London time. */
  day: string;
  systolic: number;
  diastolic: number;
  sessionCount: number;
}

export interface TrendPoint extends DailyPoint {
  /** Average of daily values over the trailing window ending on this day. */
  rollingSystolic: number;
  rollingDiastolic: number;
}

export const ROLLING_DAYS = 7;

export function dailyPoints(sessions: readonly BpSession[], period: PeriodFilter): DailyPoint[] {
  const relevant = sessions.filter(
    (s) => period === "all" || periodOf(new Date(s.takenAt)) === period,
  );
  const byDay = Map.groupBy(relevant, (s) => sessionDayKey(new Date(s.takenAt)));
  return [...byDay.entries()]
    .map(([day, daySessions]) => {
      const avg = averageSessions(daySessions);
      if (avg === null) throw new Error(`No sessions for ${day}`);
      return {
        day,
        systolic: avg.systolic,
        diastolic: avg.diastolic,
        sessionCount: daySessions.length,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function withRollingAverage(
  points: readonly DailyPoint[],
  days = ROLLING_DAYS,
): TrendPoint[] {
  return points.map((point, i) => {
    const earliest = addDaysToDateKey(point.day, -(days - 1));
    const window: DailyPoint[] = [];
    for (let j = i; j >= 0; j--) {
      const candidate = points[j];
      if (candidate === undefined || candidate.day < earliest) break;
      window.push(candidate);
    }
    const mean = (pick: (p: DailyPoint) => number) =>
      window.reduce((sum, p) => sum + pick(p), 0) / window.length;
    return {
      ...point,
      rollingSystolic: mean((p) => p.systolic),
      rollingDiastolic: mean((p) => p.diastolic),
    };
  });
}

export function filterFrom(points: readonly TrendPoint[], fromDay: string | null): TrendPoint[] {
  return fromDay === null ? [...points] : points.filter((p) => p.day >= fromDay);
}
