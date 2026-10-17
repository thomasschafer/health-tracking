import { beforeEach, describe, expect, it } from "vitest";
import { bpSessionInputSchema, type ValidBpSessionInput } from "../shared/bp.ts";
import {
  createSession,
  deleteSession,
  getSession,
  listSessions,
  restoreSession,
  updateSession,
} from "./bp-repo.ts";
import { openDatabase, type Db } from "./db/index.ts";
import { ConflictError, NotFoundError } from "./errors.ts";

const now = new Date("2026-10-17T20:10:00.000Z");
const later = new Date("2026-10-17T21:00:00.000Z");

const input = (overrides: Partial<ValidBpSessionInput> = {}): ValidBpSessionInput =>
  bpSessionInputSchema.parse({
    id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    takenAt: "2026-10-17T20:05:00.000Z",
    note: null,
    readings: [
      { systolic: 130, diastolic: 80, heartRate: 60 },
      { systolic: 128, diastolic: 79, heartRate: null },
      { systolic: 126, diastolic: 78, heartRate: 62 },
    ],
    ...overrides,
  });

let db: Db;
beforeEach(() => {
  db = openDatabase(":memory:");
});

describe("createSession", () => {
  it("creates a session with ordered readings", () => {
    const result = createSession(db, input(), now);
    expect(result.kind).toBe("created");
    expect(getSession(db, input().id)).toEqual({
      ...input(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it("is idempotent for identical retries", () => {
    createSession(db, input(), now);
    expect(createSession(db, input(), later).kind).toBe("unchanged");
    expect(listSessions(db)).toHaveLength(1);
  });

  it("rejects reusing an ID with different content", () => {
    createSession(db, input(), now);
    expect(() => createSession(db, input({ note: "different" }), later)).toThrow(ConflictError);
  });

  it("rejects recreating a deleted session", () => {
    createSession(db, input(), now);
    deleteSession(db, input().id, later);
    expect(() => createSession(db, input(), later)).toThrow(ConflictError);
  });

  it("enforces reading invariants in the database too", () => {
    expect(() =>
      db.$client
        .prepare(
          "insert into bp_readings (session_id, position, systolic, diastolic) values ('x', 1, 80, 90)",
        )
        .run(),
    ).toThrow();
  });
});

describe("updateSession", () => {
  it("replaces content and bumps updatedAt", () => {
    createSession(db, input(), now);
    const { id, ...rest } = input({
      note: "edited",
      readings: [{ systolic: 140, diastolic: 90, heartRate: null }],
    });
    const updated = updateSession(db, id, rest, later);
    expect(updated).toMatchObject({
      note: "edited",
      readings: rest.readings,
      updatedAt: later.toISOString(),
    });
    expect(updated.createdAt).toBe(now.toISOString());
  });

  it("leaves updatedAt alone when nothing changed", () => {
    createSession(db, input(), now);
    const { id, ...rest } = input();
    expect(updateSession(db, id, rest, later).updatedAt).toBe(now.toISOString());
  });

  it("throws for unknown sessions", () => {
    const { id, ...rest } = input();
    expect(() => updateSession(db, id, rest, later)).toThrow(NotFoundError);
  });
});

describe("delete and restore", () => {
  it("hides deleted sessions and restores them", () => {
    createSession(db, input(), now);
    deleteSession(db, input().id, later);
    expect(listSessions(db)).toEqual([]);
    expect(() => getSession(db, input().id)).toThrow(NotFoundError);
    expect(() => {
      deleteSession(db, input().id, later);
    }).toThrow(NotFoundError);

    restoreSession(db, input().id, later);
    expect(listSessions(db)).toHaveLength(1);
    expect(() => restoreSession(db, input().id, later)).toThrow(NotFoundError);
  });
});

describe("listSessions", () => {
  it("orders by time taken", () => {
    createSession(db, input({ id: crypto.randomUUID(), takenAt: "2026-10-17T21:00:00.000Z" }), now);
    createSession(db, input({ id: crypto.randomUUID(), takenAt: "2026-10-17T07:00:00.000Z" }), now);
    expect(listSessions(db).map((s) => s.takenAt)).toEqual([
      "2026-10-17T07:00:00.000Z",
      "2026-10-17T21:00:00.000Z",
    ]);
  });
});
