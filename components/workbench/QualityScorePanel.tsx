"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { KitOutput } from "@/lib/content-schema";
import type { BrandBrain } from "@/lib/brand-brain";
import { computeKitScores } from "@/lib/quality-score";
import { getPlatform } from "@/lib/platforms";
import type { Locale } from "@/lib/theme";
import { cn } from "@/lib/cn";

type Props = {
  outputs: KitOutput[];
  brain: BrandBrain;
  locale: Locale;
};

const gradeColors: Record<string, string> = {
  A: "text-emerald-600 dark:text-emerald-400",
  B: "text-brand dark:text-brand",
  C: "text-amber-600 dark:text-amber-400",
  D: "text-red-500 dark:text-red-400",
};

const gradeRings: Record<string, string> = {
  A: "ring-emerald-400/40 dark:ring-emerald-500/30",
  B: "ring-brand/40",
  C: "ring-amber-400/40 dark:ring-amber-500/30",
  D: "ring-red-400/40 dark:ring-red-500/30",
};

const dimBarColor = (score: number) =>
  score >= 80 ? "bg-emerald-500 dark:bg-emerald-400"
  : score >= 60 ? "bg-brand"
  : score >= 40 ? "bg-amber-500"
  : "bg-red-500";

export function QualityScorePanel({ outputs, brain, locale }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const en = locale === "en";

  // Only score unlocked outputs that have real content
  const scoreable = outputs.filter((o) => !o.locked && o.body.length > 10);

  if (scoreable.length === 0) return null;

  const scores = computeKitScores(scoreable, brain);

  const avgOverall = Math.round(
    Object.values(scores).reduce((s, q) => s + q.overall, 0) / Object.values(scores).length
  );
  const avgGrade =
    avgOverall >= 85 ? "A" : avgOverall >= 70 ? "B" : avgOverall >= 55 ? "C" : "D";

  return (
    <section className="rounded-xl border border-hairline bg-surface shadow-panel">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand/10">
            <Sparkles className="h-4 w-4 text-brand" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-fg">
              {en ? "Content Quality Score" : "内容质量评分"}
            </h3>
            <p className="text-xs text-fg-muted">
              {en
                ? "Clarity · Platform fit · Brand compliance · CTA strength"
                : "结构清晰度 · 平台契合度 · 品牌合规 · CTA 强度"}
            </p>
          </div>
        </div>
        {/* Aggregate badge */}
        <div className={cn("flex h-12 w-12 flex-col items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-surface", gradeRings[avgGrade])}>
          <span className={cn("text-lg font-bold leading-none", gradeColors[avgGrade])}>{avgGrade}</span>
          <span className="text-[10px] text-fg-muted">{avgOverall}</span>
        </div>
      </div>

      {/* Per-platform row */}
      <div className="divide-y divide-hairline border-t border-hairline">
        {scoreable.map((output) => {
          const q = scores[output.platform];
          if (!q) return null;
          const platform = getPlatform(output.platform);
          const isOpen = expanded === output.platform;

          return (
            <div key={output.platform}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : output.platform)}
                className="focus-ring flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-surface-2"
              >
                {/* Platform name */}
                <span className="w-28 shrink-0 text-sm font-medium text-fg truncate">{platform.shortLabel}</span>

                {/* Score bar */}
                <div className="flex flex-1 items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", dimBarColor(q.overall))}
                      style={{ width: `${q.overall}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm font-semibold tabular-nums text-fg">{q.overall}</span>
                </div>

                {/* Grade chip */}
                <span className={cn("w-6 text-right text-sm font-bold", gradeColors[q.grade])}>{q.grade}</span>

                {/* Expand toggle */}
                <span className="ml-1 text-fg-muted">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </button>

              {/* Expanded dimension breakdown */}
              {isOpen && (
                <div className="grid gap-2 bg-surface-2 px-5 py-4">
                  {q.dimensions.map((dim) => (
                    <div key={dim.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                      <div>
                        <p className="text-xs font-semibold text-fg">
                          {en ? dim.labelEn : dim.labelZh}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-5 text-fg-muted">
                          {en ? dim.reasonEn : dim.reasonZh}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={cn("text-sm font-bold tabular-nums", gradeColors[
                          dim.score >= 85 ? "A" : dim.score >= 70 ? "B" : dim.score >= 55 ? "C" : "D"
                        ])}>{dim.score}</span>
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-hairline">
                          <div
                            className={cn("h-full rounded-full", dimBarColor(dim.score))}
                            style={{ width: `${dim.score}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hint if brand memory is not configured */}
      {!brain.brandName && (
        <div className="border-t border-hairline px-5 py-3">
          <p className="text-xs text-fg-muted">
            {en
              ? "Configure Brand Memory to unlock brand consistency scoring."
              : "配置「品牌记忆」后，可以获得更准确的品牌一致性评分。"}
          </p>
        </div>
      )}
    </section>
  );
}
