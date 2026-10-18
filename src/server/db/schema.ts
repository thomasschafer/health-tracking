import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const bpSessions = sqliteTable(
  "bp_sessions",
  {
    id: text("id").primaryKey(),
    /** UTC ISO-8601 with milliseconds. */
    takenAt: text("taken_at").notNull(),
    note: text("note"),
    source: text("source", { enum: ["app", "sheet-import"] }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    check("bp_sessions_source", sql`${t.source} in ('app', 'sheet-import')`),
    index("bp_sessions_taken_at").on(t.takenAt),
  ],
);

export const bpReadings = sqliteTable(
  "bp_readings",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => bpSessions.id, { onDelete: "cascade" }),
    /** 1-based order within the session. */
    position: integer("position").notNull(),
    systolic: integer("systolic").notNull(),
    diastolic: integer("diastolic").notNull(),
    heartRate: integer("heart_rate"),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.position] }),
    check("bp_readings_position", sql`${t.position} between 1 and 5`),
    check("bp_readings_systolic", sql`${t.systolic} between 50 and 300`),
    check("bp_readings_diastolic", sql`${t.diastolic} between 20 and 200`),
    check("bp_readings_order", sql`${t.systolic} > ${t.diastolic}`),
    check(
      "bp_readings_heart_rate",
      sql`${t.heartRate} is null or ${t.heartRate} between 20 and 250`,
    ),
  ],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  /** JSON-encoded value, validated by the settings schema on read. */
  value: text("value").notNull(),
});

export const backupChecks = sqliteTable(
  "backup_checks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: ["replica", "export"] }).notNull(),
    checkedAt: text("checked_at").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    detail: text("detail").notNull(),
  },
  (t) => [check("backup_checks_kind", sql`${t.kind} in ('replica', 'export')`)],
);

/** Written by the backup verifier so it can tell when a replica has caught up with a known write. */
export const backupCanary = sqliteTable("backup_canary", {
  id: integer("id").primaryKey(),
  nonce: text("nonce").notNull(),
  writtenAt: text("written_at").notNull(),
});

/** Each time a full copy of the data was exported from the app by hand. */
export const manualExports = sqliteTable("manual_exports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  exportedAt: text("exported_at").notNull(),
});
