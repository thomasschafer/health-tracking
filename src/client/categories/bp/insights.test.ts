import { describe, expect, it } from "vitest";
import { addDaysToDateKey } from "../../../shared/time.ts";
import { bpInsights } from "./insights.ts";
import { testSession } from "./test-helpers.ts";

const today = "2026-10-18";
const at = (daysAgo: number, hourUtc: number, sys: number, dia: number) =>
  testSession(
    `${addDaysToDateKey(today, -daysAgo)}T${String(hourUtc).padStart(2, "0")}:00:00.000Z`,
    sys,
    dia,
  );

describe("bpInsights", () => {
  it("returns nothing without data", () => {
    expect(bpInsights([], today)).toEqual([]);
  });

  it("reports a falling trend as positive", () => {
    const sessions = [
      at(40, 7, 145, 92),
      at(45, 7, 145, 92),
      at(50, 7, 145, 92),
      at(1, 7, 135, 85),
      at(5, 7, 135, 85),
      at(9, 7, 135, 85),
    ];
    expect(bpInsights(sessions, today).find((i) => i.kind === "trend")).toMatchObject({
      tone: "positive",
      title: "Trending down",
      body: "Over the last 30 days you've averaged -10/-7 mmHg compared with the 30 days before.",
    });
  });

  it("reports a rising trend in a high range as needing attention", () => {
    const sessions = [
      at(40, 7, 130, 80),
      at(45, 7, 130, 80),
      at(50, 7, 130, 80),
      at(1, 7, 142, 90),
      at(5, 7, 142, 90),
      at(9, 7, 142, 90),
    ];
    expect(bpInsights(sessions, today).find((i) => i.kind === "trend")).toMatchObject({
      tone: "attention",
      title: "Trending up",
    });
  });

  it("falls back to 90-day windows when data is sparse", () => {
    const sessions = [
      at(100, 20, 140, 90),
      at(120, 20, 140, 90),
      at(150, 20, 140, 90),
      at(10, 20, 132, 84),
      at(40, 20, 132, 84),
      at(70, 20, 132, 84),
    ];
    expect(bpInsights(sessions, today).find((i) => i.kind === "trend")).toMatchObject({
      title: "Trending down",
      body: "Over the last 90 days you've averaged -8/-6 mmHg compared with the 90 days before.",
    });
  });

  it("calls small changes steady", () => {
    const sessions = [
      at(40, 7, 130, 80),
      at(45, 7, 130, 80),
      at(50, 7, 130, 80),
      at(1, 7, 131, 81),
      at(5, 7, 129, 80),
      at(9, 7, 130, 79),
    ];
    expect(bpInsights(sessions, today).find((i) => i.kind === "trend")?.title).toBe(
      "Holding steady",
    );
  });

  it("compares mornings and evenings", () => {
    const sessions = [
      at(1, 7, 125, 75),
      at(2, 7, 125, 75),
      at(3, 7, 125, 75),
      at(1, 20, 135, 85),
      at(2, 20, 135, 85),
      at(3, 20, 135, 85),
    ];
    expect(bpInsights(sessions, today).find((i) => i.kind === "time-of-day")).toMatchObject({
      title: "Evenings run higher",
      body: "Over the last 90 days, evening readings average 135/85 and morning readings 125/75.",
    });
  });

  it("encourages consistent measuring", () => {
    expect(
      bpInsights([at(1, 7, 125, 75)], today).find((i) => i.kind === "consistency"),
    ).toMatchObject({
      tone: "neutral",
      title: "Measured on 1 of the last 7 days",
    });
    const week = [0, 1, 2, 3].map((d) => at(d, 7, 125, 75));
    expect(bpInsights(week, today).find((i) => i.kind === "consistency")).toMatchObject({
      tone: "positive",
      title: "Great consistency",
    });
  });
});
