import { describe, expect, it } from "vitest";
import type { BpSession } from "../shared/bp.ts";
import { dailyPoints, withRollingAverage } from "./chart-data.ts";

const session = (takenAt: string, systolic: number, diastolic: number): BpSession => ({
  id: crypto.randomUUID(),
  takenAt,
  note: null,
  readings: [{ systolic, diastolic, heartRate: null }],
  createdAt: takenAt,
  updatedAt: takenAt,
});

const sessions = [
  session("2026-10-01T07:00:00.000Z", 120, 80),
  session("2026-10-01T20:00:00.000Z", 140, 90),
  session("2026-10-02T07:00:00.000Z", 130, 70),
  session("2026-10-10T07:00:00.000Z", 110, 60),
];

describe("dailyPoints", () => {
  it("averages each day's sessions", () => {
    expect(dailyPoints(sessions, "all")).toEqual([
      { day: "2026-10-01", systolic: 130, diastolic: 85, sessionCount: 2 },
      { day: "2026-10-02", systolic: 130, diastolic: 70, sessionCount: 1 },
      { day: "2026-10-10", systolic: 110, diastolic: 60, sessionCount: 1 },
    ]);
  });

  it("filters by period", () => {
    expect(dailyPoints(sessions, "evening")).toEqual([
      { day: "2026-10-01", systolic: 140, diastolic: 90, sessionCount: 1 },
    ]);
  });
});

describe("withRollingAverage", () => {
  it("averages over the trailing window, skipping days outside it", () => {
    const trend = withRollingAverage(dailyPoints(sessions, "all"));
    expect(trend.map((p) => [p.rollingSystolic, p.rollingDiastolic])).toEqual([
      [130, 85],
      [130, 77.5],
      // 1 and 2 October are more than 7 days before 10 October.
      [110, 60],
    ]);
  });
});
