import { DEFAULT_SETTINGS, settingsSchema, type Settings } from "../shared/settings.ts";
import type { Queryable } from "./db/index.ts";
import { settings } from "./db/schema.ts";

export function getSettings(db: Queryable): Settings {
  const stored = Object.fromEntries(
    db
      .select()
      .from(settings)
      .all()
      .map((row) => [row.key, JSON.parse(row.value) as unknown]),
  );
  return settingsSchema.parse({ ...DEFAULT_SETTINGS, ...stored });
}

export function saveSettings(db: Queryable, next: Settings): Settings {
  const valid = settingsSchema.parse(next);
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(valid)) {
      tx.insert(settings)
        .values({ key, value: JSON.stringify(value) })
        .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(value) } })
        .run();
    }
  });
  return getSettings(db);
}
