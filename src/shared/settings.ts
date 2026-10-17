import { z } from "zod";
import { DEFAULT_READINGS_PER_SESSION, MAX_READINGS_PER_SESSION } from "./bp.ts";

export const settingsSchema = z
  .object({
    readingsPerSession: z.number().int().min(1).max(MAX_READINGS_PER_SESSION),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  readingsPerSession: DEFAULT_READINGS_PER_SESSION,
};
