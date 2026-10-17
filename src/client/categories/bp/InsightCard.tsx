import { CalendarCheck, Equal, Sun, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "../../ui/Card.tsx";
import type { Insight } from "./insights.ts";

function insightIcon(insight: Insight): ReactNode {
  switch (insight.kind) {
    case "trend":
      if (insight.title === "Holding steady") return <Equal size={20} />;
      return insight.title === "Trending up" ? (
        <TrendingUp size={20} />
      ) : (
        <TrendingDown size={20} />
      );
    case "time-of-day":
      return <Sun size={20} />;
    case "consistency":
      return <CalendarCheck size={20} />;
  }
}

export function InsightCard({ insight, to }: { insight: Insight; to?: string }) {
  return (
    <Card className={`insight ${insight.tone}`} {...(to === undefined ? {} : { to })}>
      <span className="insight-icon" aria-hidden="true">
        {insightIcon(insight)}
      </span>
      <span>
        <span className="insight-title">{insight.title}</span>
        <span className="insight-body">{insight.body}</span>
      </span>
    </Card>
  );
}
