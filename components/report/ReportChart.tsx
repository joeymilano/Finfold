"use client";

import React from "react";
import { compactNumber, type ChartSpec, type ChartPoint } from "@/lib/report/chart-spec";

/**
 * Self-drawn charts for report evidence (设计方案 §3.4).
 *
 * P0 renders `sparkline` and `line`; P1 adds `bar` and `funnel`. Colors
 * reference Finfold semantic CSS variables only, so light/dark themes both
 * work without hard-coded values. Empty windows render an explicit empty
 * state — never a fake zero line.
 */

type ReportChartProps = {
  spec: ChartSpec;
  locale: "zh" | "en";
};

const EMPTY_STATE = { zh: "这段时间没有数据", en: "No data in this window" } as const;

export function ReportChart({ spec, locale }: ReportChartProps) {
  const points = spec.series[0]?.points ?? [];
  if (spec.type === "sparkline" && points.length >= 2) {
    return <Sparkline spec={spec} points={points} locale={locale} />;
  }
  if (spec.type === "line" && points.length >= 2) {
    return <LineChart spec={spec} points={points} locale={locale} />;
  }
  if (spec.type === "bar" && points.length >= 1) {
    return <BarChart spec={spec} points={points} locale={locale} />;
  }
  if (spec.type === "funnel" && points.length >= 2) {
    return <FunnelChart spec={spec} points={points} locale={locale} />;
  }
  return <ChartEmptyState locale={locale} label={locale === "zh" ? spec.titleZh : spec.titleEn} />;
}

function ChartEmptyState({ locale, label }: { locale: "zh" | "en"; label: string }) {
  return (
    <div
      role="img"
      aria-label={`${label} — ${EMPTY_STATE[locale]}`}
      className="flex h-16 w-full items-center justify-center rounded-lg border border-dashed border-hairline"
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
        {EMPTY_STATE[locale]}
      </span>
    </div>
  );
}

function scaleBounds(values: number[]): { min: number; max: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    const pad = Math.abs(min) > 1 ? Math.abs(min) * 0.08 : 1;
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

function Sparkline({ spec, points, locale }: { spec: ChartSpec; points: ChartPoint[]; locale: "zh" | "en" }) {
  const width = 320;
  const height = 48;
  const { min, max } = scaleBounds(points.map((point) => point.y));
  const stepX = width / (points.length - 1);
  const coords = points.map((point, index) => ({
    x: index * stepX,
    y: height - 4 - ((point.y - min) / (max - min)) * (height - 8)
  }));
  const path = coords.map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  const rising = points[points.length - 1].y >= points[0].y;
  const stroke = rising ? "rgb(var(--positive))" : "rgb(var(--risk))";
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-12 w-full"
      role="img"
      aria-label={`${locale === "zh" ? spec.titleZh : spec.titleEn}${spec.unit ? ` (${spec.unit})` : ""}`}
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r="3" fill={stroke} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function LineChart({ spec, points, locale }: { spec: ChartSpec; points: ChartPoint[]; locale: "zh" | "en" }) {
  const width = 640;
  const height = 160;
  const padding = { top: 18, right: 16, bottom: 22, left: 44 };
  const values = points.map((point) => point.y);
  const { min, max } = scaleBounds(values);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const toY = (value: number) => padding.top + plotHeight - ((value - min) / (max - min)) * plotHeight;
  const coords = points.map((point, index) => ({
    x: padding.left + index * stepX,
    y: toY(point.y),
    point
  }));
  const path = coords.map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(" ");
  const gridLines = [0, 0.5, 1].map((ratio) => padding.top + plotHeight * ratio);
  const ticks = [max, (max + min) / 2, min];
  const annotated = coords.filter((coord) => locale === "zh" ? coord.point.annotatedZh : coord.point.annotatedEn);
  const seriesName = locale === "zh" ? spec.series[0].nameZh : spec.series[0].nameEn;
  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full"
        role="img"
        aria-label={`${locale === "zh" ? spec.titleZh : spec.titleEn}${spec.unit ? ` (${spec.unit})` : ""}`}
      >
        {gridLines.map((y) => (
          <line
            key={y}
            x1={padding.left}
            x2={width - padding.right}
            y1={y}
            y2={y}
            stroke="rgb(var(--hairline))"
            strokeWidth="1"
          />
        ))}
        {ticks.map((tick, index) => (
          <text
            key={`${tick}-${index}`}
            x={padding.left - 6}
            y={gridLines[index] + 3}
            textAnchor="end"
            fontSize="10"
            fill="rgb(var(--fg-subtle))"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {compactNumber(tick, locale)}
          </text>
        ))}
        <path d={path} fill="none" stroke="rgb(var(--action))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {annotated.map((coord) => (
          <g key={`${coord.x}-${coord.y}`}>
            <circle cx={coord.x} cy={coord.y} r="6" fill="none" stroke="rgb(var(--risk))" strokeWidth="1.5" />
            <circle cx={coord.x} cy={coord.y} r="3" fill="rgb(var(--risk))" />
            <text
              x={coord.x}
              y={coord.y - 10}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="rgb(var(--risk))"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {locale === "zh" ? coord.point.annotatedZh : coord.point.annotatedEn}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 flex items-center justify-between text-[10px] text-fg-subtle">
        <span className="font-semibold">{seriesName}{spec.unit ? ` · ${spec.unit}` : ""}</span>
        <span>
          {points[0]?.x} – {points[points.length - 1]?.x}
        </span>
      </figcaption>
    </figure>
  );
}

function BarChart({ spec, points, locale }: { spec: ChartSpec; points: ChartPoint[]; locale: "zh" | "en" }) {
  const width = 640;
  const height = 160;
  const padding = { top: 18, right: 16, bottom: 26, left: 44 };
  const values = points.map((point) => point.y);
  const { min, max } = scaleBounds(values);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const slot = plotWidth / points.length;
  const barWidth = Math.min(48, Math.max(8, slot * 0.6));
  const baseline = padding.top + plotHeight;
  const gridLines = [0, 0.5, 1].map((ratio) => padding.top + plotHeight * ratio);
  const ticks = [max, (max + min) / 2, min];
  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full"
        role="img"
        aria-label={`${locale === "zh" ? spec.titleZh : spec.titleEn}${spec.unit ? ` (${spec.unit})` : ""}`}
      >
        {gridLines.map((y) => (
          <line
            key={y}
            x1={padding.left}
            x2={width - padding.right}
            y1={y}
            y2={y}
            stroke="rgb(var(--hairline))"
            strokeWidth="1"
          />
        ))}
        {ticks.map((tick, index) => (
          <text
            key={`${tick}-${index}`}
            x={padding.left - 6}
            y={gridLines[index] + 3}
            textAnchor="end"
            fontSize="10"
            fill="rgb(var(--fg-subtle))"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {compactNumber(tick, locale)}
          </text>
        ))}
        {points.map((point, index) => {
          const barHeight = Math.max(1, ((point.y - min) / (max - min)) * plotHeight);
          const x = padding.left + slot * index + (slot - barWidth) / 2;
          const annotated = locale === "zh" ? point.annotatedZh : point.annotatedEn;
          return (
            <g key={`${point.x}-${index}`}>
              <rect
                x={x}
                y={baseline - barHeight}
                width={barWidth}
                height={barHeight}
                rx="2"
                fill={annotated ? "rgb(var(--risk))" : "rgb(var(--action))"}
                opacity="0.85"
              />
              <text
                x={x + barWidth / 2}
                y={baseline - barHeight - 5}
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill="rgb(var(--fg-muted))"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {compactNumber(point.y, locale)}
              </text>
              <text
                x={x + barWidth / 2}
                y={baseline + 13}
                textAnchor="middle"
                fontSize="9"
                fill="rgb(var(--fg-subtle))"
              >
                {point.x.slice(0, 8)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/**
 * Funnel stage chain — one row per stage, bar width proportional to the
 * stage's share of the first stage (same-unit counts only, per builder).
 * The annotated break stage renders in risk color with its drop label; a
 * cliff is never drawn without its explanation (§4.2).
 */
function FunnelChart({ spec, points, locale }: { spec: ChartSpec; points: ChartPoint[]; locale: "zh" | "en" }) {
  const first = Math.max(...points.map((point) => point.y));
  const zh = locale === "zh";
  return (
    <figure className="w-full">
      <div className="space-y-1.5">
        {points.map((point, index) => {
          const previous = index > 0 ? points[index - 1] : null;
          const widthPct = first > 0 ? Math.max(point.y > 0 ? 2 : 0, (point.y / first) * 100) : 0;
          const stepPct = previous && previous.y > 0 && point.y <= previous.y
            ? Math.round((point.y / previous.y) * 100)
            : null;
          const annotated = zh ? point.annotatedZh : point.annotatedEn;
          return (
            <div key={`${point.x}-${index}`} className="flex items-center gap-2">
              <span className="w-14 shrink-0 truncate text-[10px] font-bold text-fg-muted">{point.x}</span>
              <div className="h-4 min-w-0 flex-1 rounded-sm bg-surface-2">
                <div
                  className={`h-full rounded-sm ${annotated ? "bg-risk/80" : "bg-action/80"}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="w-14 shrink-0 text-right font-mono text-[10px] font-black tabular-nums">
                {compactNumber(point.y, locale)}
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-[9px] font-semibold tabular-nums text-fg-subtle">
                {index === 0 ? (zh ? "起点" : "top") : stepPct !== null ? `${stepPct}%` : "—"}
              </span>
              {annotated ? (
                <span className="inline-flex shrink-0 items-center rounded-md border border-risk/30 bg-risk/[0.08] px-1.5 py-0.5 font-mono text-[9px] font-black text-risk">
                  {annotated}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <figcaption className="mt-1.5 flex items-center justify-between text-[10px] text-fg-subtle">
        <span className="font-semibold">{zh ? spec.titleZh : spec.titleEn}{spec.unit ? ` · ${spec.unit}` : ""}</span>
        <span>{zh ? "宽度按首阶段占比" : "Bar width = share of first stage"}</span>
      </figcaption>
    </figure>
  );
}
