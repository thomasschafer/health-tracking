import { describe, expect, it } from "vitest";
import { backupStatus, recordBackupCheck, recordManualExport } from "./backup-status.ts";
import { openDatabase } from "./db/index.ts";

const now = new Date("2026-10-18T12:00:00.000Z");
const configured = { replica: true, export: false };

describe("backupStatus", () => {
  it("reports unconfigured, stale, failing and healthy checks", () => {
    const db = openDatabase(":memory:");
    expect(backupStatus(db, configured, now)).toMatchObject({
      replica: { state: "stale", lastOkAt: null },
      export: { state: "not-configured" },
    });
    recordBackupCheck(db, "replica", new Date("2026-10-18T11:00:00.000Z"), {
      ok: true,
      detail: "fine",
    });
    expect(backupStatus(db, configured, now).replica).toEqual({
      state: "ok",
      checkedAt: "2026-10-18T11:00:00.000Z",
    });
    recordBackupCheck(db, "replica", new Date("2026-10-18T11:30:00.000Z"), {
      ok: false,
      detail: "broken",
    });
    expect(backupStatus(db, configured, now).replica).toMatchObject({
      state: "failing",
      detail: "broken",
    });
  });

  it("reminds about manual exports after 30 days", () => {
    const db = openDatabase(":memory:");
    expect(backupStatus(db, configured, now).manualExport).toEqual({
      lastExportedAt: null,
      due: true,
    });
    recordManualExport(db, new Date("2026-09-20T12:00:00.000Z"));
    expect(backupStatus(db, configured, now).manualExport).toEqual({
      lastExportedAt: "2026-09-20T12:00:00.000Z",
      due: false,
    });
    expect(
      backupStatus(db, configured, new Date("2026-10-21T12:00:00.000Z")).manualExport.due,
    ).toBe(true);
  });
});
