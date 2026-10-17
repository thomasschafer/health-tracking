import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { BpAverage } from "../../../shared/bp.ts";
import type { Bucket, BucketSize } from "./trend.ts";

const HEIGHT = 200;
const MARGIN = { top: 8, right: 34, bottom: 22, left: 4 };
const TARGET = { systolic: 135, diastolic: 85 };

const keyMs = (key: string) => Date.parse(`${key}T00:00:00Z`);
const tickDay = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const tickWeekday = new Intl.DateTimeFormat("en-GB", { weekday: "narrow", timeZone: "UTC" });
const tickMonth = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const tickYear = new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "UTC" });

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
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
  return [ref, width] as const;
}

function tickLabel(bucket: Bucket, size: BucketSize, index: number, count: number): string | null {
  const date = keyMs(bucket.start);
  switch (size) {
    case "day":
      if (count <= 7) return tickWeekday.format(date);
      // Weekly ticks counted back from today, so the latest day is always labelled.
      return (count - 1 - index) % 7 === 0 ? tickDay.format(date) : null;
    case "week":
      return Number(bucket.start.slice(8)) <= 7 ? tickMonth.format(date) : null;
    case "month":
      if (count <= 13) return tickMonth.format(date).slice(0, 1);
      return bucket.start.slice(5, 7) === "01" ? tickYear.format(date) : null;
  }
}

interface RangeChartProps {
  buckets: readonly Bucket[];
  bucketSize: BucketSize;
  /** Called with the scrubbed bucket, or null when scrubbing ends. */
  onSelect: (bucket: Bucket | null) => void;
  selected: Bucket | null;
}

/**
 * One bar per bucket from average diastolic to average systolic, with the NICE home-monitoring
 * thresholds drawn as reference lines. Dragging across the chart selects buckets.
 */
export function RangeChart({ buckets, bucketSize, onSelect, selected }: RangeChartProps) {
  const [ref, width] = useWidth();

  const layout = useMemo(() => {
    if (width === 0 || buckets.length === 0) return null;
    const averages = buckets.flatMap((b) => (b.average === null ? [] : [b.average]));
    const lo = Math.min(...averages.map((a) => a.diastolic), TARGET.diastolic) - 8;
    const hi = Math.max(...averages.map((a) => a.systolic), TARGET.systolic) + 8;
    const yMin = Math.floor(lo / 10) * 10;
    const yMax = Math.ceil(hi / 10) * 10;
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const slot = plotWidth / buckets.length;
    const barWidth = Math.max(2, Math.min(14, slot * 0.6));
    const x = (i: number) => MARGIN.left + slot * (i + 0.5);
    const y = (v: number) => MARGIN.top + (1 - (v - yMin) / (yMax - yMin)) * plotHeight;
    const step = yMax - yMin > 90 ? 40 : 20;
    const ticks: number[] = [];
    for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) ticks.push(v);
    return { x, y, slot, barWidth, ticks, plotWidth, plotHeight };
  }, [buckets, width]);

  const indexAt = (event: PointerEvent<SVGRectElement>) => {
    if (layout === null) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const i = Math.floor((event.clientX - rect.left) / layout.slot);
    return Math.min(Math.max(i, 0), buckets.length - 1);
  };

  const selectNearestWithData = (i: number | null) => {
    if (i === null) return;
    let best: Bucket | null = null;
    let bestDistance = Infinity;
    buckets.forEach((b, j) => {
      if (b.average !== null && Math.abs(j - i) < bestDistance) {
        bestDistance = Math.abs(j - i);
        best = b;
      }
    });
    onSelect(best);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const withData = buckets.filter((b) => b.average !== null);
    if (withData.length === 0) return;
    const current = selected === null ? -1 : withData.findIndex((b) => b.start === selected.start);
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const next =
        current === -1
          ? withData.length - 1
          : Math.min(
              Math.max(current + (event.key === "ArrowLeft" ? -1 : 1), 0),
              withData.length - 1,
            );
      onSelect(withData[next] ?? null);
    } else if (event.key === "Escape") {
      onSelect(null);
    }
  };

  const bar = (avg: BpAverage, i: number) => {
    if (layout === null) return null;
    const top = layout.y(avg.systolic);
    const bottom = layout.y(avg.diastolic);
    return (
      <rect
        x={layout.x(i) - layout.barWidth / 2}
        y={top}
        width={layout.barWidth}
        height={Math.max(bottom - top, layout.barWidth)}
        rx={layout.barWidth / 2}
      />
    );
  };

  return (
    <div className="range-chart" ref={ref}>
      {layout !== null && (
        <svg
          width={width}
          height={HEIGHT}
          tabIndex={0}
          role="img"
          aria-label="Blood pressure range chart. Use the left and right arrow keys to inspect values."
          onKeyDown={onKeyDown}
          onBlur={() => {
            onSelect(null);
          }}
        >
          {layout.ticks.map((v) => (
            <g key={v}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + layout.plotWidth}
                y1={layout.y(v)}
                y2={layout.y(v)}
                className="chart-grid"
              />
              <text
                x={width - 2}
                y={layout.y(v)}
                className="chart-tick"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {v}
              </text>
            </g>
          ))}
          {(["systolic", "diastolic"] as const).map((m) => (
            <line
              key={m}
              x1={MARGIN.left}
              x2={MARGIN.left + layout.plotWidth}
              y1={layout.y(TARGET[m])}
              y2={layout.y(TARGET[m])}
              className="chart-target"
            />
          ))}
          {buckets.map((b, i) => {
            const label = tickLabel(b, bucketSize, i, buckets.length);
            return (
              label !== null && (
                <text
                  key={b.start}
                  x={layout.x(i)}
                  y={HEIGHT - 4}
                  className="chart-tick"
                  textAnchor="middle"
                >
                  {label}
                </text>
              )
            );
          })}
          {selected !== null &&
            (() => {
              const i = buckets.findIndex((b) => b.start === selected.start);
              return (
                i !== -1 && (
                  <line
                    x1={layout.x(i)}
                    x2={layout.x(i)}
                    y1={MARGIN.top}
                    y2={MARGIN.top + layout.plotHeight}
                    className="chart-crosshair"
                  />
                )
              );
            })()}
          <g className={selected === null ? "chart-bars" : "chart-bars has-selection"}>
            {buckets.map((b, i) =>
              b.average === null ? null : (
                <g key={b.start} className={selected?.start === b.start ? "selected" : undefined}>
                  {bar(b.average, i)}
                </g>
              ),
            )}
          </g>
          <rect
            x={MARGIN.left}
            y={0}
            width={layout.plotWidth}
            height={HEIGHT}
            fill="transparent"
            style={{ touchAction: "pan-y" }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              selectNearestWithData(indexAt(e));
            }}
            onPointerMove={(e) => {
              if (e.pointerType === "mouse" || e.currentTarget.hasPointerCapture(e.pointerId)) {
                selectNearestWithData(indexAt(e));
              }
            }}
            onPointerUp={(e) => {
              if (e.pointerType !== "mouse") onSelect(null);
            }}
            onPointerCancel={() => {
              onSelect(null);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") onSelect(null);
            }}
          />
        </svg>
      )}
    </div>
  );
}
