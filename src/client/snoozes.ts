import { z } from "zod";

const STORAGE_KEY = "health.snoozes.v1";
const snoozesSchema = z.record(z.string(), z.iso.datetime());
export type Snoozes = z.infer<typeof snoozesSchema>;

/** Snoozed notices, kept per device: when each notice ID should next be shown. */
export function loadSnoozes(): Snoozes {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return {};
  try {
    return snoozesSchema.parse(JSON.parse(raw));
  } catch (err) {
    // Snoozes are only a convenience, so unreadable ones are discarded rather than blocking.
    console.error("Discarding unreadable snoozes", err);
    localStorage.removeItem(STORAGE_KEY);
    return {};
  }
}

export function saveSnoozes(snoozes: Snoozes): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snoozes));
}

export const isSnoozed = (snoozes: Snoozes, id: string, now: Date): boolean => {
  const until = snoozes[id];
  return until !== undefined && new Date(until).getTime() > now.getTime();
};
