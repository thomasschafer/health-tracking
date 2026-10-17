import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { TrendPoint } from "../chart-data.ts";
import { ROLLING_DAYS } from "../chart-data.ts";

const HEIGHT = 220;
const MARGIN = { top: 12, right: 44, bottom: 24, left: 34 };
const THRESHOLDS = { systolic: 135, diastolic: 85 };

const dayMs = (day: string): number => Date.parse(`${day}T00:00:00Z`);

const tickFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const tickFormatterWithYear = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const tooltipFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, width];
}

function linePath(points: readonly { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
}

/** Daily averages as faint dots, with a 2px trailing-average line per measure. */
export function TrendChart({ points }: { points: readonly TrendPoint[] }) {
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const layout = useMemo(() => {
    const first = points[0];
    const last = points.at(-1);
    if (first === undefined || last === undefined || width === 0) return null;
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const x0 = dayMs(first.day);
    const span = Math.max(dayMs(last.day) - x0, 86_400_000);
    const values = points.flatMap((p) => [p.systolic, p.diastolic]);
    const yMin = Math.floor(Math.min(...values, THRESHOLDS.diastolic - 10) / 10) * 10;
    const yMax = Math.ceil(Math.max(...values, THRESHOLDS.systolic + 10) / 10) * 10;
    const x = (day: string) => MARGIN.left + ((dayMs(day) - x0) / span) * plotWidth;
    const y = (value: number) => MARGIN.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;
    const step = yMax - yMin > 80 ? 20 : 10;
    const yTicks: number[] = [];
    for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) yTicks.push(v);
    const tickCount = Math.max(2, Math.min(5, Math.floor(plotWidth / 90)));
    const longRange = span > 120 * 86_400_000;
    const xTicks = Array.from({ length: tickCount }, (_, i) => {
      const t = x0 + (span * i) / (tickCount - 1);
      return {
        x: MARGIN.left + (plotWidth * i) / (tickCount - 1),
        label: (longRange ? tickFormatterWithYear : tickFormatter).format(t),
      };
    });
    return { x, y, yTicks, xTicks, plotWidth, plotHeight };
  }, [points, width]);

  const onPointer = (event: PointerEvent<SVGRectElement>) => {
    if (layout === null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left + MARGIN.left;
    let best = 0;
    let bestDistance = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(layout.x(p.day) - px);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    setHoverIndex(best);
  };

  const hovered = hoverIndex === null ? undefined : points[hoverIndex];
  const last = points.at(-1);

  return (
    <div className="chart" ref={containerRef}>
      <div className="legend" aria-hidden="true">
        <span>
          <span className="key" style={{ background: "var(--series-systolic)" }} />
          Systolic
        </span>
        <span>
          <span className="key" style={{ background: "var(--series-diastolic)" }} />
          Diastolic
        </span>
        <span className="muted">{ROLLING_DAYS}-day average, mmHg</span>
      </div>
      {layout !== null && last !== undefined && (
        <svg
          height={HEIGHT}
          role="img"
          aria-label={`Blood pressure trend. Latest ${String(ROLLING_DAYS)}-day average ${String(Math.round(last.rollingSystolic))}/${String(Math.round(last.rollingDiastolic))}.`}
        >
          {layout.yTicks.map((v) => (
            <g key={v}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + layout.plotWidth}
                y1={layout.y(v)}
                y2={layout.y(v)}
                stroke="var(--grid)"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 6}
                y={layout.y(v)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="var(--text-muted)"
                className="tabular"
              >
                {v}
              </text>
            </g>
          ))}
          {(["systolic", "diastolic"] as const).map((measure) => (
            <g key={measure}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + layout.plotWidth}
                y1={layout.y(THRESHOLDS[measure])}
                y2={layout.y(THRESHOLDS[measure])}
                stroke="var(--axis)"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left + 4}
                y={layout.y(THRESHOLDS[measure]) - 4}
                fontSize={10}
                fill="var(--text-muted)"
              >
                {measure === "systolic" ? "135 home target" : "85 home target"}
              </text>
            </g>
          ))}
          {layout.xTicks.map((t, i) => (
            <text
              key={i}
              x={t.x}
              y={HEIGHT - 6}
              textAnchor={i === 0 ? "start" : i === layout.xTicks.length - 1 ? "end" : "middle"}
              fontSize={11}
              fill="var(--text-muted)"
            >
              {t.label}
            </text>
          ))}
          {(["systolic", "diastolic"] as const).map((measure) => {
            const color =
              measure === "systolic" ? "var(--series-systolic)" : "var(--series-diastolic)";
            const rolling = measure === "systolic" ? "rollingSystolic" : "rollingDiastolic";
            const lastRolling = last[rolling];
            return (
              <g key={measure}>
                {points.map((p) => (
                  <circle
                    key={p.day}
                    cx={layout.x(p.day)}
                    cy={layout.y(p[measure])}
                    r={2}
                    fill={color}
                    opacity={0.3}
                  />
                ))}
                <path
                  d={linePath(points.map((p) => ({ x: layout.x(p.day), y: layout.y(p[rolling]) })))}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <circle
                  cx={layout.x(last.day)}
                  cy={layout.y(lastRolling)}
                  r={4}
                  fill={color}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
                <text
                  x={layout.x(last.day) + 8}
                  y={layout.y(lastRolling)}
                  dominantBaseline="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--text-primary)"
                  className="tabular"
                >
                  {Math.round(lastRolling)}
                </text>
              </g>
            );
          })}
          {hovered !== undefined && (
            <line
              x1={layout.x(hovered.day)}
              x2={layout.x(hovered.day)}
              y1={MARGIN.top}
              y2={MARGIN.top + layout.plotHeight}
              stroke="var(--text-muted)"
              strokeWidth={1}
            />
          )}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={layout.plotWidth}
            height={layout.plotHeight}
            fill="transparent"
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => {
              setHoverIndex(null);
            }}
          />
        </svg>
      )}
      {layout !== null && hovered !== undefined && (
        <div
          className="tooltip"
          style={{
            left: Math.min(Math.max(layout.x(hovered.day) - 90, 0), width - 180),
            top: 28,
          }}
        >
          <div>
            <strong>{tooltipFormatter.format(dayMs(hovered.day))}</strong>
          </div>
          <div className="tabular">
            {ROLLING_DAYS}-day average {Math.round(hovered.rollingSystolic)}/
            {Math.round(hovered.rollingDiastolic)}
          </div>
          <div className="tabular muted">
            That day {Math.round(hovered.systolic)}/{Math.round(hovered.diastolic)} (
            {hovered.sessionCount} session{hovered.sessionCount === 1 ? "" : "s"})
          </div>
        </div>
      )}
    </div>
  );
}
