import React from "react";
import { FileStack, Image as ImageIcon, Palette, Sparkles } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";
import { visualStoryThemes } from "@/lib/visual-story";
import type { VisualIntelligencePlan } from "@/lib/visual-intelligence";

type Props = {
  plan: VisualIntelligencePlan;
  locale: Locale;
  onOpenPrimary: () => void;
  onOpenCover: () => void;
  onOpenStory: () => void;
  illustrationCount?: number;
  onOpenIllustrations?: () => void;
};

export function VisualAssetPlanCard({ plan, locale, onOpenPrimary, onOpenCover, onOpenStory, illustrationCount = 0, onOpenIllustrations }: Props) {
  const theme = visualStoryThemes[plan.theme];
  const displayTheme = { ...theme, ...plan.paletteOverride };
  const primaryIsStory = plan.primaryStudio === "story";

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-action/20 bg-[linear-gradient(135deg,var(--surface-2),var(--surface))]">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 shadow-sm"
            style={{ background: displayTheme.paper, color: displayTheme.accent }}
          >
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: displayTheme.accent }} />
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold text-fg">{plan.title}</p>
              <span className="rounded-full bg-action/[0.09] px-2 py-0.5 text-[9px] font-bold text-action-strong dark:text-action">
                {locale === "en" ? "Ready" : "已自动规划"}
              </span>
              {plan.brandAligned ? <span className="rounded-full border border-hairline bg-surface px-2 py-0.5 text-[9px] font-bold text-fg-muted">{locale === "en" ? "Brand visual applied" : "已应用品牌视觉"}</span> : null}
            </div>
            <p className="mt-1 text-[10px] font-semibold text-fg-muted">
              {plan.formatSummary} · {locale === "zh" ? theme.labelZh : theme.labelEn} · {strategyLabel(plan.strategy, locale)}
            </p>
            <p className="mt-1 max-w-2xl text-[11px] leading-4 text-fg-muted">{plan.rationale}</p>
            <p className="mt-1 text-[10px] font-bold text-action-strong dark:text-action">{locale === "zh" ? `优化目标：${plan.outcome}` : `Optimizing: ${plan.outcome}`}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 pl-[52px] sm:pl-0">
          <button type="button" onClick={onOpenPrimary} className="focus-ring inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-3 py-2 text-xs font-semibold text-action-strong transition hover:bg-action/[0.14] dark:text-action">
            {primaryIsStory ? <FileStack className="h-3.5 w-3.5" /> : <Palette className="h-3.5 w-3.5" />}
            {primaryIsStory
              ? locale === "en" ? "Edit visual set" : "编辑完整图文组"
              : locale === "en" ? "Design cover" : "设计封面"}
          </button>
          <button
            type="button"
            onClick={primaryIsStory ? onOpenCover : onOpenStory}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-semibold text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          >
            {primaryIsStory ? <Palette className="h-3.5 w-3.5" /> : <FileStack className="h-3.5 w-3.5" />}
            {primaryIsStory
              ? locale === "en" ? "Cover & library" : "封面与图库"
              : locale === "en" ? "Expand" : "展开成图文"}
          </button>
        </div>
      </div>
      {illustrationCount > 0 && onOpenIllustrations ? (
        <button type="button" onClick={onOpenIllustrations} className="focus-ring flex w-full items-center justify-between gap-3 border-t border-action/10 bg-action/[0.025] px-3.5 py-2.5 text-left transition hover:bg-action/[0.06]">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold text-fg"><ImageIcon className="h-3.5 w-3.5 text-action-strong dark:text-action" />{locale === "en" ? `${illustrationCount} article image placements ready` : `${illustrationCount} 个文章配图位已准备`}</span>
          <span className="text-[10px] font-bold text-action-strong dark:text-action">{locale === "en" ? "Open package →" : "打开资产包 →"}</span>
        </button>
      ) : null}
    </section>
  );
}

function strategyLabel(strategy: VisualIntelligencePlan["strategy"], locale: Locale): string {
  const labels = {
    "story-driven": { zh: "故事驱动", en: "Story-driven" },
    "information-dense": { zh: "信息密集", en: "Information-dense" },
    "visual-first": { zh: "视觉优先", en: "Visual-first" }
  } as const;
  return labels[strategy][locale];
}
