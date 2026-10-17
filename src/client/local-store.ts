import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { z } from "zod";
import {
  bpSessionInputSchema,
  bpSessionSchema,
  type BpSession,
  type BpSessionInput,
} from "../shared/bp.ts";
import { settingsSchema, type Settings } from "../shared/settings.ts";

/** A new session saved on this device that the server hasn't confirmed yet. */
export interface PendingSession {
  input: BpSessionInput;
  queuedAt: string;
  /** Set when the server rejected the session, so it needs attention rather than a retry. */
  rejection: string | null;
}

const pendingSchema = z.object({
  input: bpSessionInputSchema,
  queuedAt: z.string(),
  rejection: z.string().nullable(),
});

const snapshotSchema = z.object({
  savedAt: z.string(),
  sessions: z.array(bpSessionSchema),
  settings: settingsSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;

interface HealthDb extends DBSchema {
  pending: { key: string; value: PendingSession };
  snapshot: { key: "latest"; value: Snapshot };
}

let dbPromise: Promise<IDBPDatabase<HealthDb>> | null = null;

function db(): Promise<IDBPDatabase<HealthDb>> {
  dbPromise ??= openDB<HealthDb>("health-tracking", 1, {
    upgrade(database) {
      database.createObjectStore("pending");
      database.createObjectStore("snapshot");
    },
  });
  return dbPromise;
}

export async function listPending(): Promise<PendingSession[]> {
  const all = await (await db()).getAll("pending");
  return all
    .map((p) => pendingSchema.parse(p))
    .sort((a, b) => a.input.takenAt.localeCompare(b.input.takenAt));
}

export async function putPending(pending: PendingSession): Promise<void> {
  await (await db()).put("pending", pending, pending.input.id);
}

export async function removePending(id: string): Promise<void> {
  await (await db()).delete("pending", id);
}

export async function saveSnapshot(sessions: BpSession[], settings: Settings): Promise<void> {
  await (
    await db()
  ).put("snapshot", { savedAt: new Date().toISOString(), sessions, settings }, "latest");
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  const stored = await (await db()).get("snapshot", "latest");
  if (stored === undefined) return null;
  const parsed = snapshotSchema.safeParse(stored);
  if (!parsed.success) {
    // A snapshot is only a cache of server data, so an unreadable one is safe to discard.
    console.error("Discarding unreadable snapshot", parsed.error);
    return null;
  }
  return parsed.data;
}

/** Asks the browser not to evict local data, which would otherwise risk losing unsynced readings. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!("storage" in navigator) || !("persist" in navigator.storage)) return false;
  return (await navigator.storage.persisted()) || (await navigator.storage.persist());
}
