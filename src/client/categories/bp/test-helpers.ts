import type { BpSession } from "../../../shared/bp.ts";

/** A one-reading session at a UTC instant, for tests. */
export function testSession(takenAt: string, systolic: number, diastolic: number): BpSession {
  return {
    id: crypto.randomUUID(),
    takenAt,
    note: null,
    readings: [{ systolic, diastolic, heartRate: null }],
    createdAt: takenAt,
    updatedAt: takenAt,
  };
}
