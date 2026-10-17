import { and, asc, eq, isNull } from "drizzle-orm";
import {
  bpSessionSchema,
  type BpSession,
  type Reading,
  type ValidBpSessionInput,
} from "../shared/bp.ts";
import type { Queryable } from "./db/index.ts";
import { bpReadings, bpSessions } from "./db/schema.ts";
import { ConflictError, NotFoundError } from "./errors.ts";

type SessionRow = typeof bpSessions.$inferSelect;
type ReadingRow = typeof bpReadings.$inferSelect;
export type SessionSource = SessionRow["source"];

function toSession(row: SessionRow, readings: readonly ReadingRow[]): BpSession {
  const ordered = [...readings].sort((a, b) => a.position - b.position);
  ordered.forEach((r, i) => {
    if (r.position !== i + 1) {
      throw new Error(`Session ${row.id} has non-contiguous reading positions`);
    }
  });
  // Parsing guards against rows that violate invariants the database can't express.
  return bpSessionSchema.parse({
    id: row.id,
    takenAt: row.takenAt,
    note: row.note,
    readings: ordered.map((r) => ({
      systolic: r.systolic,
      diastolic: r.diastolic,
      heartRate: r.heartRate,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function readingsFor(db: Queryable, sessionId: string): ReadingRow[] {
  return db.select().from(bpReadings).where(eq(bpReadings.sessionId, sessionId)).all();
}

function insertReadings(db: Queryable, sessionId: string, readings: readonly Reading[]): void {
  db.insert(bpReadings)
    .values(readings.map((r, i) => ({ sessionId, position: i + 1, ...r })))
    .run();
}

function sameContent(existing: BpSession, input: Omit<ValidBpSessionInput, "id">): boolean {
  return (
    existing.takenAt === input.takenAt &&
    existing.note === input.note &&
    JSON.stringify(existing.readings) === JSON.stringify(input.readings)
  );
}

export function listSessions(db: Queryable): BpSession[] {
  const rows = db
    .select()
    .from(bpSessions)
    .where(isNull(bpSessions.deletedAt))
    .orderBy(asc(bpSessions.takenAt))
    .all();
  const readings = db
    .select({ reading: bpReadings })
    .from(bpReadings)
    .innerJoin(bpSessions, eq(bpReadings.sessionId, bpSessions.id))
    .where(isNull(bpSessions.deletedAt))
    .all();
  const bySession = Map.groupBy(
    readings.map((r) => r.reading),
    (r) => r.sessionId,
  );
  return rows.map((row) => toSession(row, bySession.get(row.id) ?? []));
}

export function getSession(db: Queryable, id: string): BpSession {
  const row = db
    .select()
    .from(bpSessions)
    .where(and(eq(bpSessions.id, id), isNull(bpSessions.deletedAt)))
    .get();
  if (row === undefined) {
    throw new NotFoundError(`Session ${id} not found`);
  }
  return toSession(row, readingsFor(db, id));
}

export type CreateResult =
  { kind: "created"; session: BpSession } | { kind: "unchanged"; session: BpSession };

/**
 * Creates a session. Retrying with identical content is a no-op, so clients can safely resend
 * after a lost response. Reusing an ID with different content is a conflict.
 */
export function createSession(
  db: Queryable,
  input: ValidBpSessionInput,
  now: Date,
  source: SessionSource = "app",
): CreateResult {
  return db.transaction((tx) => {
    const existing = tx.select().from(bpSessions).where(eq(bpSessions.id, input.id)).get();
    if (existing !== undefined) {
      if (existing.deletedAt !== null) {
        throw new ConflictError(`Session ${input.id} was deleted`);
      }
      const session = toSession(existing, readingsFor(tx, input.id));
      if (!sameContent(session, input)) {
        throw new ConflictError(`Session ${input.id} already exists with different content`);
      }
      return { kind: "unchanged", session };
    }
    const timestamp = now.toISOString();
    tx.insert(bpSessions)
      .values({
        id: input.id,
        takenAt: input.takenAt,
        note: input.note,
        source,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    insertReadings(tx, input.id, input.readings);
    return { kind: "created", session: getSession(tx, input.id) };
  });
}

export function updateSession(
  db: Queryable,
  id: string,
  input: Omit<ValidBpSessionInput, "id">,
  now: Date,
): BpSession {
  return db.transaction((tx) => {
    const current = getSession(tx, id);
    if (sameContent(current, input)) {
      return current;
    }
    tx.update(bpSessions)
      .set({ takenAt: input.takenAt, note: input.note, updatedAt: now.toISOString() })
      .where(eq(bpSessions.id, id))
      .run();
    tx.delete(bpReadings).where(eq(bpReadings.sessionId, id)).run();
    insertReadings(tx, id, input.readings);
    return getSession(tx, id);
  });
}

/** Soft-deletes a session so it can be restored. */
export function deleteSession(db: Queryable, id: string, now: Date): void {
  const result = db
    .update(bpSessions)
    .set({ deletedAt: now.toISOString(), updatedAt: now.toISOString() })
    .where(and(eq(bpSessions.id, id), isNull(bpSessions.deletedAt)))
    .run();
  if (result.changes !== 1) {
    throw new NotFoundError(`Session ${id} not found`);
  }
}

export function restoreSession(db: Queryable, id: string, now: Date): BpSession {
  return db.transaction((tx) => {
    const row = tx.select().from(bpSessions).where(eq(bpSessions.id, id)).get();
    if (row?.deletedAt == null) {
      throw new NotFoundError(`Deleted session ${id} not found`);
    }
    tx.update(bpSessions)
      .set({ deletedAt: null, updatedAt: now.toISOString() })
      .where(eq(bpSessions.id, id))
      .run();
    return getSession(tx, id);
  });
}
