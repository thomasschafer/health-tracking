import { z } from "zod";
import type { Db } from "../db/index.ts";
import { bpReadings, bpSessions, settings } from "../db/schema.ts";

export const EXPORT_FORMAT_VERSION = 1 as const;

const exportSchema = z
  .object({
    format: z.literal("health-tracking-export"),
    version: z.literal(EXPORT_FORMAT_VERSION),
    exportedAt: z.string(),
    tables: z.object({
      bp_sessions: z.array(
        z.object({
          id: z.string(),
          takenAt: z.string(),
          note: z.string().nullable(),
          source: z.enum(["app", "sheet-import"]),
          createdAt: z.string(),
          updatedAt: z.string(),
          deletedAt: z.string().nullable(),
        }),
      ),
      bp_readings: z.array(
        z.object({
          sessionId: z.string(),
          position: z.number().int(),
          systolic: z.number().int(),
          diastolic: z.number().int(),
          heartRate: z.number().int().nullable(),
        }),
      ),
      settings: z.array(z.object({ key: z.string(), value: z.string() })),
    }),
  })
  .strict();
export type JsonExport = z.infer<typeof exportSchema>;

/** A lossless dump of all user data, including deleted sessions, readable without the app. */
export function exportJson(db: Db, now: Date): JsonExport {
  return db.$client.transaction(() => ({
    format: "health-tracking-export" as const,
    version: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    tables: {
      bp_sessions: db.select().from(bpSessions).orderBy(bpSessions.id).all(),
      bp_readings: db
        .select()
        .from(bpReadings)
        .orderBy(bpReadings.sessionId, bpReadings.position)
        .all(),
      settings: db.select().from(settings).orderBy(settings.key).all(),
    },
  }))();
}

function* chunks<T>(rows: readonly T[], size = 500): Generator<T[]> {
  for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size);
}

/** Loads an export into an empty database, e.g. to recover from a lost laptop and replica. */
export function importJson(db: Db, raw: unknown): void {
  const data = exportSchema.parse(raw);
  db.$client.transaction(() => {
    const existing = db.select({ id: bpSessions.id }).from(bpSessions).limit(1).all();
    if (existing.length > 0) {
      throw new Error("Refusing to import an export into a database that already has sessions");
    }
    const { bp_sessions, bp_readings, settings: settingRows } = data.tables;
    // Chunked to stay under SQLite's limit on bound parameters per statement.
    for (const chunk of chunks(bp_sessions)) db.insert(bpSessions).values(chunk).run();
    for (const chunk of chunks(bp_readings)) db.insert(bpReadings).values(chunk).run();
    for (const chunk of chunks(settingRows)) db.insert(settings).values(chunk).run();
  })();
}
