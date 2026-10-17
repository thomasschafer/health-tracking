import { describe, expect, it } from "vitest";
import { testSession as s } from "./test-helpers.ts";
import { buildTrend } from "./trend.ts";

const sessions = [
  s("2026-10-12T07:00:00.000Z", 120, 80),
  s("2026-10-12T20:00:00.000Z", 140, 90),
  s("2026-10-17T07:00:00.000Z", 130, 70),
  s("2026-03-02T07:00:00.000Z", 110, 60),
];

describe("buildTrend", () => {
  it("makes one bucket per day for a week, including empty days", () => {
    const trend = buildTrend(sessions, "W", "all", "2026-10-18");
    expect(trend.bucketSize).toBe("day");
    expect(trend.buckets.map((b) => b.start)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(trend.buckets[0]).toMatchObject({
      sessionCount: 2,
      average: { systolic: 130, diastolic: 85 },
    });
    expect(trend.buckets[1]).toMatchObject({ sessionCount: 0, average: null });
    expect(trend.sessionCount).toBe(3);
    expect(trend.average).toMatchObject({ systolic: 130, diastolic: 80 });
  });

  it("filters by time of day", () => {
    const trend = buildTrend(sessions, "W", "evening", "2026-10-18");
    expect(trend.sessionCount).toBe(1);
    expect(trend.average).toMatchObject({ systolic: 140, diastolic: 90 });
  });

  it("uses Monday-based weeks for six months", () => {
    const trend = buildTrend(sessions, "6M", "all", "2026-10-18");
    expect(trend.bucketSize).toBe("week");
    expect(trend.buckets.at(-1)).toMatchObject({
      start: "2026-10-12",
      end: "2026-10-18",
      sessionCount: 3,
    });
    expect(new Date(`${trend.buckets[0]?.start ?? ""}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it("uses months for a year and clips the last bucket to today", () => {
    const trend = buildTrend(sessions, "Y", "all", "2026-10-18");
    expect(trend.bucketSize).toBe("month");
    expect(trend.buckets).toHaveLength(13);
    expect(trend.buckets.at(-1)).toMatchObject({ start: "2026-10-01", end: "2026-10-18" });
    expect(trend.buckets.find((b) => b.start === "2026-03-01")?.sessionCount).toBe(1);
  });

  it("starts all-time trends at the first reading", () => {
    const trend = buildTrend(sessions, "All", "all", "2026-10-18");
    expect(trend.bucketSize).toBe("week");
    expect(trend.buckets[0]?.start).toBe("2026-03-02");
    expect(trend.sessionCount).toBe(4);
  });

  it("handles no data", () => {
    const trend = buildTrend([], "All", "all", "2026-10-18");
    expect(trend.buckets).toHaveLength(1);
    expect(trend.average).toBeNull();
  });
});
