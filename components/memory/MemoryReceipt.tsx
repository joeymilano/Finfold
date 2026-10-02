"use client";

import { Brain, Check, ChevronRight, Loader2, RotateCcw, X } from "@/components/ui/icons";
import React, { useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { MemoryReceiptItem } from "@/lib/memory-receipt";
import { memoryExcerpt } from "@/lib/memory-receipt";
import { getPlatform } from "@/lib/platforms";

const FEEDBACK_LABELS = {
  generic: { zh: "减少空泛表达，多用具体细节", en: "Use concrete details instead of generic claims" },
  off_brand: { zh: "更贴近你的品牌语气和定位", en: "Stay closer to your brand voice and positioning" },
  weak_hook: { zh: "优先强化开头钩子", en: "Strengthen the opening hook first" },
  platform_fit: { zh: "更严格遵循平台原生表达", en: "Follow the platform's native style more closely" },
  inaccurate: { zh: "不补写缺乏依据的事实和数据", en: "Avoid unsupported facts and metrics" },
  weak_cta: { zh: "只保留一个清晰、低门槛的行动引导", en: "Use one clear, low-friction CTA" }
} as const;

function receiptCopy(item: MemoryReceiptItem, locale: Locale): { title: string; detail?: string } {
  const platform = item.platform ? getPlatform(item.platform).label : null;

  if (item.kind === "style_rule") {
    return {
      title: locale === "en" ? "Learned a new writing preference from your edit" : "从你的修改中，学会了一条新写作习惯",
      detail: item.value
    };
  }

  if (item.kind === "feedback_rule" && item.reasonCode) {
    return {
      title: locale === "en" ? FEEDBACK_LABELS[item.reasonCode].en : `以后会${FEEDBACK_LABELS[item.reasonCode].zh}`,
      detail: platform
        ? (locale === "en" ? `Applied when writing for ${platform}` : `写${platform}内容时自动遵守`)
        : undefined
    };
  }

  const isPublish = item.source === "publish";
  return {
    title: locale === "en"
      ? `${isPublish ? "Published" : "Approved"}${platform ? ` ${platform}` : ""} content is now a reference example`
      : `${platform ? `${platform}这篇` : "这篇"}${isPublish ? "已发布" : "你认可的"}内容，已成为参考范文`,
    detail: memoryExcerpt(item.value)
  };
}

export function MemoryReceipt({
  items,
  locale,
  onDismiss,
  onUndo
}: {
  items: MemoryReceiptItem[];
  locale: Locale;
  onDismiss: () => void;
  onUndo?: () => Promise<void> | void;
}) {
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function handleUndo() {
    if (!onUndo || undoing) return;
    setUndoing(true);
    setUndoError(null);
    try {
      await onUndo();
    } catch (error) {
      setUndoError(error instanceof Error ? error.message : (locale === "en" ? "Could not forget this memory." : "暂时无法撤销这次记忆。"));
      setUndoing(false);
    }
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      className="relative mb-4 overflow-hidden rounded-xl border border-brand/25 bg-gradient-to-br from-brand/10 via-surface to-accent/5 p-4 shadow-sm"
    >
      <div aria-hidden className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand/20 bg-brand text-bg shadow-sm">
          <Brain className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-surface/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand">
                <Check className="h-3 w-3" />
                {locale === "en" ? "Saved to brand memory" : "已写入品牌记忆"}
              </div>
              <h3 className="text-sm font-semibold text-fg">
                {locale === "en" ? "Finfold understands you better now" : "这次合作后，Finfold 更懂你了"}
              </h3>
              <p className="mt-0.5 text-xs leading-5 text-fg-muted">
                {locale === "en"
                  ? `I remembered ${items.length} ${items.length === 1 ? "thing" : "things"} and will use them automatically next time.`
                  : `我记住了 ${items.length} 件事，下次创作会自动沿用。`}
              </p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label={locale === "en" ? "Dismiss memory receipt" : "关闭记忆回执"}
              className="focus-ring -mr-1 -mt-1 rounded-lg p-1.5 text-fg-muted transition hover:bg-surface hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 space-y-2 border-l border-brand/25 pl-3">
            {items.slice(0, 3).map((item, index) => {
              const copy = receiptCopy(item, locale);
              return (
                <div key={`${item.kind}-${item.source}-${index}`} className="relative">
                  <span aria-hidden className="absolute -left-[16.5px] top-1.5 h-2 w-2 rounded-full border-2 border-surface bg-brand" />
                  <p className="text-xs font-semibold leading-5 text-fg">{copy.title}</p>
                  {copy.detail ? <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-fg-muted">{copy.detail}</p> : null}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {onUndo ? (
              <button
                type="button"
                onClick={() => void handleUndo()}
                disabled={undoing}
                className="focus-ring inline-flex items-center gap-1 rounded-md text-xs font-semibold text-risk transition hover:underline disabled:cursor-wait disabled:opacity-60"
              >
                {undoing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {locale === "en" ? (undoing ? "Forgetting…" : "Forget this memory") : (undoing ? "正在撤销…" : "撤销这次记忆")}
              </button>
            ) : null}
            <a
              href="/brand-memory"
              className="focus-ring inline-flex items-center gap-1 rounded-md text-xs font-semibold text-brand hover:underline"
            >
              {locale === "en" ? "Review or edit memory" : "查看或修改品牌记忆"}
              <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </div>
          {undoError ? <p role="alert" className="mt-2 text-xs text-risk">{undoError}</p> : null}
        </div>
      </div>
    </aside>
  );
}
