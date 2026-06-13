"use client";

import { useId } from "react";
import { areaPath, seriesToPoints, smoothLinePath } from "@/lib/spline";
import { cn } from "@/lib/cn";

/**
 * Compact trend line for KPI cards: smooth brand-colored spline with a soft
 * gradient area fill. Pure inline SVG — adapts to theme via currentColor token.
 */
export function Sparkline({
  values,
  className,
  tone = "brand",
  width = 120,
  height = 36,
  strokeWidth = 2
}: {
  values: number[];
  className?: string;
  tone?: "brand" | "accent";
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  const id = useId().replace(/:/g, "");
  const colorVar = tone === "accent" ? "--accent" : "--brand";
  const points = seriesToPoints(values, width, height, strokeWidth + 1);
  const line = smoothLinePath(points);
  const area = areaPath(points, height);
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      className={cn("overflow-visible", className)}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`rgb(var(${colorVar}))`} stopOpacity="0.28" />
          <stop offset="100%" stopColor={`rgb(var(${colorVar}))`} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path
        d={line}
        fill="none"
        stroke={`rgb(var(${colorVar}))`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last ? (
        <circle cx={last.x} cy={last.y} r={strokeWidth} fill={`rgb(var(${colorVar}))`} />
      ) : null}
    </svg>
  );
}
