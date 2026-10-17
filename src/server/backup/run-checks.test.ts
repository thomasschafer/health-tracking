import { describe, expect, it } from "vitest";
import { recordBackupCheck } from "../backup-status.ts";
import { openDatabase } from "../db/index.ts";
import { isCheckDue } from "./run-checks.ts";

describe("isCheckDue", () => {
  it("is due when never run, and again once the interval has passed", () => {
    const db = openDatabase(":memory:");
    const now = new Date("2026-10-17T20:00:00.000Z");
    expect(isCheckDue(db, "replica", 24, now)).toBe(true);

    recordBackupCheck(db, "replica", now, { ok: false, detail: "failed" });
    expect(isCheckDue(db, "replica", 24, new Date("2026-10-18T19:59:00.000Z"))).toBe(false);
    expect(isCheckDue(db, "replica", 24, new Date("2026-10-18T20:00:00.000Z"))).toBe(true);
    expect(isCheckDue(db, "export", 24, now)).toBe(true);
  });
});
