import { describe, expect, it } from "vitest";
import {
  averageReadings,
  averageSessions,
  bpSessionInputSchema,
  categorise,
  periodOf,
  readingSchema,
  readingWarnings,
  sessionDayKey,
  summariseWindow,
  type BpSession,
  type Reading,
} from "./bp.ts";

const reading = (
  systolic: number,
  diastolic: number,
  heartRate: number | null = null,
): Reading => ({
  systolic,
  diastolic,
  heartRate,
});

const session = (takenAt: string, readings: Reading[]): BpSession => ({
  id: crypto.randomUUID(),
  takenAt,
  note: null,
  readings,
  createdAt: takenAt,
  updatedAt: takenAt,
});

describe("readingSchema", () => {
  it("accepts a normal reading", () => {
    expect(readingSchema.parse(reading(120, 80, 60))).toEqual(reading(120, 80, 60));
  });

  it.each([
    ["systolic too low", reading(49, 30)],
    ["systolic too high", reading(301, 80)],
    ["diastolic too low", reading(120, 19)],
    ["heart rate too high", reading(120, 80, 251)],
    ["non-integer", reading(120.5, 80)],
    ["diastolic not below systolic", reading(80, 80)],
  ])("rejects %s", (_, r) => {
    expect(readingSchema.safeParse(r).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(readingSchema.safeParse({ ...reading(120, 80), pulse: 60 }).success).toBe(false);
  });
});

describe("bpSessionInputSchema", () => {
  const valid = {
    id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    takenAt: "2026-10-17T20:05:00.000Z",
    note: "  after coffee  ",
    readings: [reading(120, 80)],
  };

  it("trims notes and turns blank notes into null", () => {
    expect(bpSessionInputSchema.parse(valid).note).toBe("after coffee");
    expect(bpSessionInputSchema.parse({ ...valid, note: "   " }).note).toBeNull();
  });

  it("requires a normalised UTC timestamp", () => {
    expect(
      bpSessionInputSchema.safeParse({ ...valid, takenAt: "2026-10-17T21:05:00+01:00" }).success,
    ).toBe(false);
    expect(
      bpSessionInputSchema.safeParse({ ...valid, takenAt: "2026-10-17T20:05:00Z" }).success,
    ).toBe(false);
  });

  it("requires between one and five readings", () => {
    expect(bpSessionInputSchema.safeParse({ ...valid, readings: [] }).success).toBe(false);
    expect(
      bpSessionInputSchema.safeParse({ ...valid, readings: Array(6).fill(reading(120, 80)) })
        .success,
    ).toBe(false);
  });
});

describe("averages", () => {
  it("averages readings, ignoring missing heart rates", () => {
    expect(averageReadings([reading(120, 80, 60), reading(130, 90), reading(125, 85, 70)])).toEqual(
      {
        systolic: 125,
        diastolic: 85,
        heartRate: 65,
      },
    );
  });

  it("reports a null heart rate when none were recorded", () => {
    expect(averageReadings([reading(120, 80)]).heartRate).toBeNull();
  });

  it("weights each session equally", () => {
    const sessions = [
      session("2026-10-17T08:00:00.000Z", [reading(120, 80)]),
      session("2026-10-17T20:00:00.000Z", [reading(140, 90), reading(140, 90), reading(140, 90)]),
    ];
    expect(averageSessions(sessions)).toEqual({ systolic: 130, diastolic: 85, heartRate: null });
  });

  it("returns null for no sessions", () => {
    expect(averageSessions([])).toBeNull();
  });

  it("throws rather than averaging nothing", () => {
    expect(() => averageReadings([])).toThrow("empty");
  });
});

describe("periodOf and sessionDayKey", () => {
  it.each([
    ["2026-01-15T02:59:00.000Z", "evening", "2026-01-14"],
    ["2026-01-15T03:00:00.000Z", "morning", "2026-01-15"],
    ["2026-01-15T14:59:00.000Z", "morning", "2026-01-15"],
    ["2026-01-15T15:00:00.000Z", "evening", "2026-01-15"],
    ["2026-01-15T23:30:00.000Z", "evening", "2026-01-15"],
    // 02:30 BST is the previous evening.
    ["2026-07-15T01:30:00.000Z", "evening", "2026-07-14"],
  ])("%s is %s on %s", (takenAt, period, day) => {
    expect(periodOf(new Date(takenAt))).toBe(period);
    expect(sessionDayKey(new Date(takenAt))).toBe(day);
  });
});

describe("categorise", () => {
  it.each([
    [{ systolic: 85, diastolic: 70 }, "low"],
    [{ systolic: 120, diastolic: 59 }, "low"],
    [{ systolic: 134, diastolic: 84 }, "normal"],
    [{ systolic: 135, diastolic: 70 }, "stage1"],
    [{ systolic: 120, diastolic: 85 }, "stage1"],
    [{ systolic: 150, diastolic: 80 }, "stage2"],
    [{ systolic: 130, diastolic: 95 }, "stage2"],
    [{ systolic: 180, diastolic: 80 }, "severe"],
    [{ systolic: 130, diastolic: 120 }, "severe"],
  ] as const)("%o is %s", (avg, expected) => {
    expect(categorise(avg)).toBe(expected);
  });
});

describe("readingWarnings", () => {
  it("flags unusual values", () => {
    expect(readingWarnings(reading(185, 90, 160))).toEqual(["very-high", "unusual-heart-rate"]);
    expect(readingWarnings(reading(85, 55))).toEqual(["low"]);
    expect(readingWarnings(reading(125, 80, 65))).toEqual([]);
  });
});

describe("summariseWindow", () => {
  const now = new Date("2026-10-17T12:00:00.000Z");
  const sessions = [
    session("2026-10-17T07:00:00.000Z", [reading(120, 80)]),
    session("2026-10-16T20:00:00.000Z", [reading(140, 90)]),
    // After midnight, so it counts as the evening of 11 October: the first day of a 7-day window.
    session("2026-10-11T23:30:00.000Z", [reading(130, 85)]),
    session("2026-10-09T20:00:00.000Z", [reading(200, 100)]),
  ];

  it("splits sessions in the window by period", () => {
    const summary = summariseWindow(sessions, now, 7);
    expect(summary.morning).toEqual({
      sessionCount: 1,
      average: { systolic: 120, diastolic: 80, heartRate: null },
    });
    expect(summary.evening).toEqual({
      sessionCount: 2,
      average: { systolic: 135, diastolic: 87.5, heartRate: null },
    });
    expect(summary.all.sessionCount).toBe(3);
  });

  it("rejects invalid windows", () => {
    expect(() => summariseWindow(sessions, now, 0)).toThrow();
  });
});
