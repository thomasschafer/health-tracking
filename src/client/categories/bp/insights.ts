import {
  averageSessions,
  categorise,
  periodOf,
  sessionDayKey,
  type BpSession,
} from "../../../shared/bp.ts";
import { addDaysToDateKey } from "../../../shared/time.ts";

export type InsightTone = "positive" | "neutral" | "attention";
export type InsightKind = "trend" | "time-of-day" | "consistency";

export interface Insight {
  kind: InsightKind;
  tone: InsightTone;
  title: string;
  body: string;
}

/** Enough sessions for an average to say something. */
const MIN_SESSIONS = 3;

const round = (n: number) => Math.round(n);

function sessionsBetween(sessions: readonly BpSession[], from: string, to: string): BpSession[] {
  return sessions.filter((s) => {
    const day = sessionDayKey(new Date(s.takenAt));
    return day >= from && day <= to;
  });
}

function trendInsight(sessions: readonly BpSession[], today: string): Insight | null {
  const recent = sessionsBetween(sessions, addDaysToDateKey(today, -29), today);
  const previous = sessionsBetween(
    sessions,
    addDaysToDateKey(today, -59),
    addDaysToDateKey(today, -30),
  );
  if (recent.length < MIN_SESSIONS || previous.length < MIN_SESSIONS) return null;
  const now = averageSessions(recent);
  const before = averageSessions(previous);
  if (now === null || before === null) return null;
  const dSys = round(now.systolic - before.systolic);
  const dDia = round(now.diastolic - before.diastolic);
  if (Math.abs(dSys) < 3 && Math.abs(dDia) < 3) {
    return {
      kind: "trend",
      tone: "neutral",
      title: "Holding steady",
      body: `Your 30-day average is within a few points of the month before (${String(round(before.systolic))}/${String(round(before.diastolic))}).`,
    };
  }
  const signed = (n: number) => (n > 0 ? `+${String(n)}` : String(n));
  const falling = dSys + dDia < 0;
  const category = categorise(now);
  const tone: InsightTone = falling
    ? category === "low"
      ? "attention"
      : "positive"
    : category === "normal"
      ? "neutral"
      : "attention";
  return {
    kind: "trend",
    tone,
    title: falling ? "Trending down" : "Trending up",
    body: `Over the last 30 days you've averaged ${signed(dSys)}/${signed(dDia)} mmHg compared with the 30 days before.`,
  };
}

function timeOfDayInsight(sessions: readonly BpSession[], today: string): Insight | null {
  const recent = sessionsBetween(sessions, addDaysToDateKey(today, -89), today);
  const morning = averageSessions(
    recent.filter((s) => periodOf(new Date(s.takenAt)) === "morning"),
  );
  const evening = averageSessions(
    recent.filter((s) => periodOf(new Date(s.takenAt)) === "evening"),
  );
  const counts = {
    morning: recent.filter((s) => periodOf(new Date(s.takenAt)) === "morning").length,
    evening: recent.filter((s) => periodOf(new Date(s.takenAt)) === "evening").length,
  };
  if (
    morning === null ||
    evening === null ||
    counts.morning < MIN_SESSIONS ||
    counts.evening < MIN_SESSIONS
  ) {
    return null;
  }
  const dSys = round(evening.systolic - morning.systolic);
  const dDia = round(evening.diastolic - morning.diastolic);
  if (Math.abs(dSys) < 4 && Math.abs(dDia) < 4) {
    return {
      kind: "time-of-day",
      tone: "neutral",
      title: "Mornings and evenings are similar",
      body: "Over the last 90 days your morning and evening averages are within a few points of each other.",
    };
  }
  const higher = dSys + dDia > 0 ? "Evenings" : "Mornings";
  return {
    kind: "time-of-day",
    tone: "neutral",
    title: `${higher} run higher`,
    body: `Over the last 90 days, evening readings average ${String(round(evening.systolic))}/${String(round(evening.diastolic))} and morning readings ${String(round(morning.systolic))}/${String(round(morning.diastolic))}.`,
  };
}

function consistencyInsight(sessions: readonly BpSession[], today: string): Insight | null {
  if (sessions.length === 0) return null;
  const days = new Set(
    sessionsBetween(sessions, addDaysToDateKey(today, -6), today).map((s) =>
      sessionDayKey(new Date(s.takenAt)),
    ),
  );
  if (days.size >= 4) {
    return {
      kind: "consistency",
      tone: "positive",
      title: "Great consistency",
      body: `You've measured on ${String(days.size)} of the last 7 days, enough for a reliable home average.`,
    };
  }
  return {
    kind: "consistency",
    tone: "neutral",
    title:
      days.size === 0
        ? "No readings this week"
        : `Measured on ${String(days.size)} of the last 7 days`,
    body: "For a reliable average, NICE suggests measuring morning and evening for at least 4 days, ideally 7.",
  };
}

export function bpInsights(sessions: readonly BpSession[], today: string): Insight[] {
  return [
    trendInsight(sessions, today),
    timeOfDayInsight(sessions, today),
    consistencyInsight(sessions, today),
  ].filter((i): i is Insight => i !== null);
}
