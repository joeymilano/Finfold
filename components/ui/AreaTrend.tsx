"use client";

import { useId, useMemo, useState } from "react";
import { areaPath, seriesToPoints, smoothLinePath } from "@/lib/spline";
import { cn } from "@/lib/cn";

export type TrendSeries = {
  label: string;
  values: number[];
  tone: "brand" | "accent";
  /** dashed = benchmark / comparison line */
  dashed?: boolean;
};

/**
 * The hero growth chart. Green primary series glows off the surface (the
 * single biggest "premium chart" signal); the blue series is a flatter
 * benchmark. Hovering reveals a floating dark value chip anchored to the
 * primary series — a bespoke touch that reads expensive.
 */
export function AreaTrend({
  series,
  labels,
  height = 220,
  formatValue = (n: number) => n.toLocaleString(),
  className
}: {
  series: TrendSeries[];
  labels?: string[];
  height?: number;
  formatValue?: (n: number) => string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const width = 760;
  const pad = 8;
  const [hover, setHover] = useState<number | null>(null);

  const primary = series.find((s) => s.tone === "brand") ?? series[0];
  const pointCount = primary?.values.length ?? 0;

  const computed = useMemo(
    () =>
      series.map((s) => {
        const pts = seriesToPoints(s.values, width, height, pad + 4);
        return {
          ...s,
          pts,
          line: smoothLinePath(pts),
          area: s.tone === "brand" ? areaPath(pts, height) : null
        };
      }),
    [series, height]
  );

  const primaryComputed = computed.find((s) => s.tone === "brand") ?? computed[0];
  const hoverPoint =
    hover !== null && primaryComputed ? primaryComputed.pts[hover] : null;
  const hoverValue =
    hover !== null && primary ? primary.values[hover] : null;

  const gridRows = [0.2, 0.4, 0.6, 0.8];

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="overflow-visible"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          if (pointCount < 2) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const idx = Math.round(ratio * (pointCount - 1));
          setHover(Math.max(0, Math.min(pointCount - 1, idx)));
        }}
      >
        <defs>
          <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--brand))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(var(--brand))" stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${id}`} x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* gridlines */}
        {gridRows.map((r) => (
          <line
            key={r}
            x1={0}
            x2={width}
            y1={height * r}
            y2={height * r}
            stroke="rgb(var(--grid-line) / 0.6)"
            strokeWidth={1}
          />
        ))}

        {/* benchmark (blue) drawn first, flatter */}
        {computed
          .filter((s) => s.tone === "accent")
          .map((s) => (
            <path
              key={s.label}
              d={s.line}
              fill="none"
              stroke="rgb(var(--accent))"
              strokeWidth={2}
              strokeDasharray={s.dashed ? "5 5" : undefined}
              strokeLinecap="round"
              opacity={0.75}
            />
          ))}

        {/* primary (green) area + glowing line */}
        {primaryComputed?.area ? (
          <path d={primaryComputed.area} fill={`url(#area-${id})`} />
        ) : null}
        {primaryComputed ? (
          <path
            d={primaryComputed.line}
            fill="none"
            stroke="rgb(var(--brand))"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#glow-${id})`}
          />
        ) : null}

        {/* hover marker */}
        {hoverPoint ? (
          <>
            <line
              x1={hoverPoint.x}
              x2={hoverPoint.x}
              y1={0}
              y2={height}
              stroke="rgb(var(--brand) / 0.35)"
              strokeWidth={1}
            />
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r={4.5}
              fill="rgb(var(--surface))"
              stroke="rgb(var(--brand))"
              strokeWidth={2.5}
            />
          </>
        ) : null}
      </svg>

      {/* floating value chip */}
      {hoverPoint && hoverValue !== null ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-hairline bg-fg px-2.5 py-1.5 text-xs font-semibold text-bg shadow-raised tabular"
          style={{
            left: `${(hoverPoint.x / width) * 100}%`,
            top: `${hoverPoint.y - 8}px`
          }}
        >
          {formatValue(hoverValue)}
          {labels && hover !== null ? (
            <span className="ml-1 font-normal opacity-60">{labels[hover]}</span>
          ) : null}
        </div>
      ) : null}

      {/* axis labels */}
      {labels ? (
        <div className="mt-2 flex justify-between text-[11px] text-fg-muted">
          {labels.map((l, i) => (
            <span key={`${l}-${i}`}>{l}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
