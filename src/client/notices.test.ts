import { describe, expect, it } from "vitest";
import type { BackupStatus } from "../shared/backup.ts";
import type { PendingSession } from "./local-store.ts";
import { buildNotices } from "./notices.ts";
import { isSnoozed } from "./snoozes.ts";

const healthy: BackupStatus = {
  replica: { state: "ok", checkedAt: "2026-10-18T10:00:00.000Z" },
  export: { state: "not-configured" },
  manualExport: { lastExportedAt: "2026-10-10T10:00:00.000Z", due: false },
};

const pendingSession = (rejection: string | null): PendingSession => ({
  input: {
    id: crypto.randomUUID(),
    takenAt: "2026-10-18T07:00:00.000Z",
    note: null,
    readings: [{ systolic: 120, diastolic: 80, heartRate: null }],
  },
  queuedAt: "2026-10-18T07:01:00.000Z",
  rejection,
});

const build = (overrides: Partial<Parameters<typeof buildNotices>[0]> = {}) =>
  buildNotices({
    pending: [],
    loadError: null,
    backupStatus: healthy,
    updateAvailable: false,
    ...overrides,
  });

describe("buildNotices", () => {
  it("is empty when everything is fine", () => {
    expect(build()).toEqual([]);
  });

  it("pins data-loss risks as critical", () => {
    const notices = build({
      pending: [pendingSession(null), pendingSession(null), pendingSession("Invalid")],
      backupStatus: {
        ...healthy,
        replica: { state: "failing", checkedAt: "2026-10-18T10:00:00.000Z", detail: "x" },
      },
    });
    expect(notices.map((n) => [n.id, n.level])).toEqual([
      ["rejected", "critical"],
      ["unsynced", "critical"],
      ["backup-replica-failing", "critical"],
    ]);
    expect(notices[1]?.title).toBe("2 readings are saved on this phone only");
  });

  it("treats a stale backup as critical", () => {
    const notices = build({
      backupStatus: { ...healthy, replica: { state: "stale", lastOkAt: null } },
    });
    expect(notices).toMatchObject([
      { id: "backup-replica-failing", body: "It hasn't been verified yet." },
    ]);
  });

  it("puts setup, export and update prompts in the notification centre", () => {
    const notices = build({
      backupStatus: {
        replica: { state: "not-configured" },
        export: { state: "not-configured" },
        manualExport: { lastExportedAt: null, due: true },
      },
      updateAvailable: true,
    });
    expect(notices.map((n) => [n.id, n.level, n.snoozable])).toEqual([
      ["replica-not-configured", "reminder", false],
      ["manual-export", "reminder", true],
      ["update", "reminder", false],
    ]);
  });

  it("ignores the optional Drive export until it is set up", () => {
    expect(build({ backupStatus: { ...healthy, export: { state: "not-configured" } } })).toEqual(
      [],
    );
  });
});

describe("isSnoozed", () => {
  it("snoozes until the stored time", () => {
    const snoozes = { "manual-export": "2026-10-25T10:00:00.000Z" };
    expect(isSnoozed(snoozes, "manual-export", new Date("2026-10-20T10:00:00.000Z"))).toBe(true);
    expect(isSnoozed(snoozes, "manual-export", new Date("2026-10-26T10:00:00.000Z"))).toBe(false);
    expect(isSnoozed(snoozes, "update", new Date("2026-10-20T10:00:00.000Z"))).toBe(false);
  });
});
