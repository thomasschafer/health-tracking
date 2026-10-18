import { describe, expect, it } from "vitest";
import { buildReport, presetRange } from "./report.ts";
import { testSession as s } from "./test-helpers.ts";

const sessions = [
  s("2026-10-10T07:00:00.000Z", 120, 80),
  s("2026-10-11T20:00:00.000Z", 140, 90),
  s("2026-10-12T07:00:00.000Z", 130, 70),
  s("2026-09-01T07:00:00.000Z", 200, 100),
];

describe("buildReport", () => {
  it("summarises sessions within the range", () => {
    const report = buildReport(sessions, "2026-10-10", "2026-10-12");
    expect(report.sessions).toHaveLength(3);
    expect(report.readingCount).toBe(3);
    expect(report.overall).toMatchObject({ systolic: 130, diastolic: 80 });
    expect(report.morning).toMatchObject({ count: 2, average: { systolic: 125, diastolic: 75 } });
    expect(report.evening).toMatchObject({ count: 1, average: { systolic: 140, diastolic: 90 } });
    expect(report.highest?.takenAt).toBe("2026-10-11T20:00:00.000Z");
    expect(report.lowest?.takenAt).toBe("2026-10-10T07:00:00.000Z");
  });

  it("handles an empty range", () => {
    const report = buildReport(sessions, "2026-01-01", "2026-01-31");
    expect(report.overall).toBeNull();
    expect(report.highest).toBeNull();
  });

  it("rejects inverted ranges", () => {
    expect(() => buildReport(sessions, "2026-10-12", "2026-10-10")).toThrow("starts after");
  });
});

describe("presetRange", () => {
  it("includes today", () => {
    expect(presetRange(7, "2026-10-18")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });
});
