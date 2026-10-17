import { useMemo } from "react";
import { localDateKey } from "../../../shared/time.ts";
import { useData } from "../../data.tsx";
import { InsightCard } from "./InsightCard.tsx";
import { bpInsights } from "./insights.ts";

const TONE_ORDER = { attention: 0, positive: 1, neutral: 2 } as const;

/** The most noteworthy blood pressure insights, for the Summary screen. */
export function BpHighlights() {
  const { sessions } = useData();
  const today = localDateKey(new Date());
  const insights = useMemo(
    () =>
      bpInsights(sessions, today)
        .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
        .slice(0, 2),
    [sessions, today],
  );
  return insights.map((insight) => <InsightCard key={insight.kind} insight={insight} to="/bp" />);
}
