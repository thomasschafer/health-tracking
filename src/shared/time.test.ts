import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  formatLocalDateTimeInput,
  fromLocal,
  localDateKey,
  parseLocalDateTimeInput,
  toLocal,
} from "./time.ts";

describe("toLocal", () => {
  it("uses GMT in winter", () => {
    expect(toLocal(new Date("2026-01-15T08:30:00Z"))).toEqual({
      year: 2026,
      month: 1,
      day: 15,
      hour: 8,
      minute: 30,
    });
  });

  it("uses BST in summer", () => {
    expect(toLocal(new Date("2026-07-15T08:30:00Z"))).toMatchObject({ hour: 9, minute: 30 });
  });

  it("rejects invalid dates", () => {
    expect(() => toLocal(new Date("nope"))).toThrow("Invalid date");
  });
});

describe("fromLocal", () => {
  it("round-trips winter and summer times", () => {
    expect(fromLocal(parseLocalDateTimeInput("2026-01-15T08:30")).toISOString()).toBe(
      "2026-01-15T08:30:00.000Z",
    );
    expect(fromLocal(parseLocalDateTimeInput("2026-07-15T09:30")).toISOString()).toBe(
      "2026-07-15T08:30:00.000Z",
    );
  });

  it("rejects times skipped by the spring clock change", () => {
    expect(() => fromLocal(parseLocalDateTimeInput("2026-03-29T01:30"))).toThrow("does not exist");
  });

  it("resolves repeated autumn times to the earlier instant", () => {
    expect(fromLocal(parseLocalDateTimeInput("2026-10-25T01:30")).toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });
});

describe("local date-time inputs", () => {
  it("formats and parses symmetrically", () => {
    const value = "2026-10-17T21:05";
    expect(formatLocalDateTimeInput(parseLocalDateTimeInput(value))).toBe(value);
  });

  it("rejects malformed input", () => {
    expect(() => parseLocalDateTimeInput("2026-10-17 21:05")).toThrow("Invalid local date-time");
  });
});

describe("date keys", () => {
  it("uses the London calendar date", () => {
    expect(localDateKey(new Date("2026-07-15T23:30:00Z"))).toBe("2026-07-16");
  });

  it("shifts across month and year boundaries", () => {
    expect(addDaysToDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
  });
});
