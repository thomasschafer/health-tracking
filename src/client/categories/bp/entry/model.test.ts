import { describe, expect, it } from "vitest";
import { emptyRow, entryReducer, type EntryAction, type EntryState } from "./model.ts";

const config = { restSeconds: 60, now: () => 1_000 };
const start = (count = 3): EntryState => ({
  rows: Array.from({ length: count }, emptyRow),
  step: { kind: "reading", index: 0, field: "systolic" },
  returnToReview: false,
  error: null,
  replace: false,
});

const run = (state: EntryState, actions: (EntryAction | string)[], cfg = config) =>
  actions.reduce<EntryState>((s, a) => {
    if (typeof a !== "string") return entryReducer(s, a, cfg);
    let next = s;
    for (const digit of a) next = entryReducer(next, { type: "digit", digit }, cfg);
    return next;
  }, state);

describe("entryReducer", () => {
  it("advances through fields as values complete, then rests before the next reading", () => {
    let s = run(start(), ["128"]);
    expect(s.step).toEqual({ kind: "reading", index: 0, field: "diastolic" });
    s = run(s, ["79"]);
    expect(s.step).toEqual({ kind: "reading", index: 0, field: "heartRate" });
    s = run(s, ["62"]);
    expect(s.step).toEqual({ kind: "rest", nextIndex: 1, endsAt: 61_000 });
    expect(s.rows[0]).toEqual({ systolic: "128", diastolic: "79", heartRate: "62" });
    s = run(s, [{ type: "rest-done" }]);
    expect(s.step).toEqual({ kind: "reading", index: 1, field: "systolic" });
  });

  it("waits for a third digit when the value could still grow", () => {
    const s = run(start(), ["12"]);
    expect(s.step).toMatchObject({ field: "systolic" });
    expect(run(s, [{ type: "next" }]).step).toMatchObject({ field: "diastolic" });
  });

  it("lets pulse be skipped", () => {
    const s = run(start(1), ["128", "79", { type: "next" }]);
    expect(s.step).toEqual({ kind: "review" });
    expect(s.rows[0]?.heartRate).toBe("");
  });

  it("skips the rest timer when it is turned off", () => {
    const s = run(start(), ["128", "79", { type: "next" }], { ...config, restSeconds: 0 });
    expect(s.step).toEqual({ kind: "reading", index: 1, field: "systolic" });
  });

  it("stays on an invalid reading with an error", () => {
    const s = run(start(), ["85", "95", { type: "next" }]);
    expect(s.step).toEqual({ kind: "reading", index: 0, field: "diastolic" });
    expect(s.error).toBe("Systolic must be higher than diastolic");
    expect(run(s, [{ type: "backspace" }]).error).toBeNull();
  });

  it("ignores leading zeros and a fourth digit", () => {
    const s = run(start(), ["0", "1", "2"]);
    expect(s.rows[0]?.systolic).toBe("12");
  });

  it("replaces a field's value when the field is chosen directly", () => {
    let s = run(start(), ["128", "79"]);
    s = run(s, [{ type: "focus", field: "systolic" }, "13"]);
    expect(s.rows[0]?.systolic).toBe("13");
    s = run(s, ["5"]);
    expect(s.rows[0]?.systolic).toBe("135");
    expect(s.step).toMatchObject({ field: "diastolic" });
  });

  it("replaces the offending value after a validation error", () => {
    const s = run(start(), ["85", "95", { type: "next" }, "75"]);
    expect(s.rows[0]).toMatchObject({ systolic: "85", diastolic: "75" });
  });

  it("ignores digits that would exceed the maximum", () => {
    const s = run(start(), ["301"]);
    expect(s.rows[0]?.systolic).toBe("30");
  });

  it("moves back a field when deleting from an empty field", () => {
    const s = run(start(), ["128", { type: "backspace" }]);
    expect(s.step).toMatchObject({ field: "systolic" });
    expect(run(s, [{ type: "backspace" }]).rows[0]?.systolic).toBe("12");
  });

  it("returns to the review after correcting a reading", () => {
    let s = run(start(1), ["128", "79", { type: "next" }]);
    s = run(s, [
      { type: "edit-reading", index: 0 },
      { type: "focus", field: "diastolic" },
      { type: "backspace" },
      { type: "backspace" },
      "81",
      { type: "next" },
    ]);
    expect(s.step).toEqual({ kind: "review" });
    expect(s.rows[0]).toMatchObject({ diastolic: "81" });
  });

  it("adds and removes readings from the review", () => {
    let s = run(start(1), ["128", "79", { type: "next" }, { type: "add-reading" }]);
    expect(s.rows).toHaveLength(2);
    expect(s.step).toEqual({ kind: "reading", index: 1, field: "systolic" });
    s = run(s, ["130", "80", { type: "next" }]);
    expect(s.step).toEqual({ kind: "review" });
    s = run(s, [{ type: "remove-reading", index: 0 }]);
    expect(s.rows).toEqual([{ systolic: "130", diastolic: "80", heartRate: "" }]);
    expect(run(s, [{ type: "remove-reading", index: 0 }]).rows).toHaveLength(1);
  });
});
