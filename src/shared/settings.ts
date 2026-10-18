import { z } from "zod";
import { DEFAULT_READINGS_PER_SESSION, MAX_READINGS_PER_SESSION } from "./bp.ts";

export const REST_TIMER_OPTIONS = [0, 30, 60, 90, 120] as const;

export const settingsSchema = z
  .object({
    readingsPerSession: z.number().int().min(1).max(MAX_READINGS_PER_SESSION),
    /** Pause between readings in a session, in seconds. Zero turns the timer off. */
    restTimerSeconds: z
      .number()
      .int()
      .refine(
        (n) => (REST_TIMER_OPTIONS as readonly number[]).includes(n),
        "Unsupported rest timer length",
      ),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;

/** Settings as returned by the server, tolerating fields added by newer server versions. */
export const settingsResponseSchema = settingsSchema.strip();

export const DEFAULT_SETTINGS: Settings = {
  readingsPerSession: DEFAULT_READINGS_PER_SESSION,
  restTimerSeconds: 60,
};
