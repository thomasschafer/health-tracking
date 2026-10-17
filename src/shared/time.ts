export const APP_TIME_ZONE = "Europe/London";

export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function requirePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const part = parts.find((p) => p.type === type);
  if (part === undefined) {
    throw new Error(`Missing ${type} when formatting date`);
  }
  const value = Number(part.value);
  if (!Number.isInteger(value)) {
    throw new Error(`Non-integer ${type} "${part.value}" when formatting date`);
  }
  return value;
}

export function toLocal(instant: Date): LocalDateTime {
  if (Number.isNaN(instant.getTime())) {
    throw new Error("Invalid date");
  }
  const parts = partsFormatter.formatToParts(instant);
  return {
    year: requirePart(parts, "year"),
    month: requirePart(parts, "month"),
    day: requirePart(parts, "day"),
    hour: requirePart(parts, "hour"),
    minute: requirePart(parts, "minute"),
  };
}

function offsetMinutesAt(instant: Date): number {
  const local = toLocal(instant);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const truncated = Math.floor(instant.getTime() / 60_000) * 60_000;
  return (asUtc - truncated) / 60_000;
}

/**
 * Converts a wall-clock time in APP_TIME_ZONE to an instant.
 *
 * Throws for times that don't exist (skipped by the spring DST change). Times that occur twice
 * (repeated by the autumn change) resolve to the earlier instant.
 */
export function fromLocal(local: LocalDateTime): Date {
  const naiveUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const candidates = new Set<number>();
  for (const probe of [naiveUtc - 3 * 3_600_000, naiveUtc + 3 * 3_600_000]) {
    candidates.add(naiveUtc - offsetMinutesAt(new Date(probe)) * 60_000);
  }
  const matches = [...candidates]
    .filter((t) => {
      const back = toLocal(new Date(t));
      return (
        back.year === local.year &&
        back.month === local.month &&
        back.day === local.day &&
        back.hour === local.hour &&
        back.minute === local.minute
      );
    })
    .sort((a, b) => a - b);
  const first = matches[0];
  if (first === undefined) {
    throw new Error(`${formatLocalDateTimeInput(local)} does not exist in ${APP_TIME_ZONE}`);
  }
  return new Date(first);
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** Formats as the value used by `<input type="datetime-local">`, e.g. 2026-10-17T21:05. */
export function formatLocalDateTimeInput(local: LocalDateTime): string {
  return `${pad(local.year, 4)}-${pad(local.month)}-${pad(local.day)}T${pad(local.hour)}:${pad(local.minute)}`;
}

export function parseLocalDateTimeInput(value: string): LocalDateTime {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match === null) {
    throw new Error(`Invalid local date-time "${value}"`);
  }
  const [, year, month, day, hour, minute] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return { year, month, day, hour, minute };
}

/** The calendar date in APP_TIME_ZONE, e.g. 2026-10-17. */
export function localDateKey(instant: Date): string {
  const local = toLocal(instant);
  return `${pad(local.year, 4)}-${pad(local.month)}-${pad(local.day)}`;
}

/** Shifts a YYYY-MM-DD calendar date by a whole number of days. */
export function addDaysToDateKey(key: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (match === null) {
    throw new Error(`Invalid date key "${key}"`);
  }
  const shifted = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  );
  return shifted.toISOString().slice(0, 10);
}

export function formatTime(instant: Date): string {
  const local = toLocal(instant);
  return `${pad(local.hour)}:${pad(local.minute)}`;
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(instant: Date): string {
  return dateFormatter.format(instant);
}
