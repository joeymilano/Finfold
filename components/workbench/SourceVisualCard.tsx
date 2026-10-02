"use client";

import { Image as ImageIcon, Loader2, Sparkles, X } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";
import { ACTION_CREDITS } from "@/lib/payment/types";
import type { SourceImageAsset, SourceImageCandidate, VisualMode } from "@/lib/source-image";

type Props = {
  locale: Locale;
  mode: VisualMode;
  source: SourceImageAsset | null;
  candidates: SourceImageCandidate[];
  loading?: boolean;
  noMatch?: boolean;
  disabled?: boolean;
  canGenerateAi: boolean;
  platformCount: number;
  onModeChange: (mode: VisualMode) => void;
  onSelect: (candidate: SourceImageCandidate) => void;
};

export function SourceVisualCard({
  locale,
  mode,
  source,
  candidates,
  loading = false,
  noMatch = false,
  disabled = false,
  canGenerateAi,
  platformCount,
  onModeChange,
  onSelect
}: Props) {
  const zh = locale !== "en";
  const active = mode === "source_first";
  const chipActiveClass = "border-action/40 bg-action/10 text-action-strong dark:text-action";
  const chipIdleClass = "border-hairline text-fg-muted";
  return (
    <div className="rounded-lg border border-hairline bg-surface p-3" data-testid="source-visual-card">
      <div className="flex items-start gap-3">
        <div
          className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-hairline bg-surface-2 bg-cover bg-center"
          style={source ? { backgroundImage: `url(${JSON.stringify(source.cachedUrl).slice(1, -1)})` } : undefined}
          aria-label={source?.alt || (zh ? "智能配图预览" : "Smart visual preview")}
        >
          {!source ? loading ? <Loader2 className="h-4 w-4 animate-spin text-fg-muted" /> : <ImageIcon className="h-5 w-5 text-fg-muted" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-fg">{zh ? "智能配图" : "Smart visual"}</span>
            {source ? (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${source.rightsStatus === "official_unverified" || source.rightsStatus === "unknown" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-positive/10 text-positive"}`}>
                {source.rightsStatus === "official_unverified" ? (zh ? "官方来源 · 待确认授权" : "Official · rights unconfirmed") : (zh ? "来源已记录" : "Source recorded")}
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-[11px] text-fg-muted">
            {mode === "none"
              ? (zh ? "本内容包不使用图片" : "No image for this content kit")
              : mode === "ai_generate"
                ? (zh ? `主动生成 AI 图片 · ${ACTION_CREDITS.standardImage} × ${platformCount} 点数` : `Generate AI images · ${ACTION_CREDITS.standardImage} × ${platformCount} Credits`)
                : source
                  ? source.domain
                  : loading
                    ? (zh ? "正在查找可信的官方图片…" : "Finding a trusted official image…")
                    : noMatch
                      ? (zh ? "没有找到可信的官方图片，不会自动使用泛化图片" : "No trusted official image found. Generic imagery will not be substituted")
                      : (zh ? "粘贴官网或文章链接后自动选择高置信度图片" : "Paste an official or article URL to find a high-confidence image")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={disabled} onClick={() => onModeChange("source_first")} className={`focus-ring rounded-md border px-2 py-1 text-[11px] font-semibold ${active ? chipActiveClass : chipIdleClass}`}>
              {source ? (zh ? "更换" : "Replace") : (zh ? "智能查找" : "Find image")}
            </button>
            <button type="button" disabled={disabled} onClick={() => onModeChange("none")} className={`focus-ring inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${mode === "none" ? chipActiveClass : chipIdleClass}`}>
              <X className="h-3 w-3" />{zh ? "不使用" : "No image"}
            </button>
            {canGenerateAi ? (
              <button type="button" disabled={disabled} onClick={() => onModeChange("ai_generate")} className={`focus-ring inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${mode === "ai_generate" ? chipActiveClass : chipIdleClass}`}>
                <Sparkles className="h-3 w-3" />{zh ? "AI 生成" : "Generate with AI"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {active && candidates.length > 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-hairline pt-3 sm:grid-cols-4">
          {candidates.slice(0, 8).map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              disabled={disabled || loading}
              onClick={() => onSelect(candidate)}
              className="focus-ring group relative aspect-[4/3] overflow-hidden rounded-md border border-hairline bg-surface-2 bg-cover bg-center"
              style={{ backgroundImage: `url(${JSON.stringify(candidate.originalUrl).slice(1, -1)})` }}
              title={`${candidate.domain} · ${candidate.confidence}`}
            >
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1.5 py-1 text-left text-[9px] text-white">{candidate.domain}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
