"use client";

import React from "react";
import { AlertTriangle, Check, Loader2, Sparkles } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";
import type { ToneDriftAssessment } from "@/lib/tone-drift";

type ToneDriftAlertProps = {
  assessment?: ToneDriftAssessment;
  isLoading?: boolean;
  locale: Locale;
  onUseDirection?: (direction: string) => void;
};

function baselineLabel(assessment: ToneDriftAssessment, locale: Locale): string {
  const baseline = assessment.baseline;
  if (!baseline) return locale === "en" ? "No reference posts yet" : "暂无可参考的历史内容";
  if (locale === "en") {
    if (baseline.source === "performance") return `${baseline.performanceSampleCount} top-performing post${baseline.performanceSampleCount === 1 ? "" : "s"}`;
    if (baseline.source === "brand_memory") return "Brand Memory examples";
    return `${baseline.performanceSampleCount} top posts + Brand Memory`;
  }
  if (baseline.source === "performance") return `${baseline.performanceSampleCount} 条高表现内容`;
  if (baseline.source === "brand_memory") return "品牌记忆示例";
  return `${baseline.performanceSampleCount} 条高表现内容 + 品牌记忆`;
}

export function ToneDriftAlert({ assessment, isLoading = false, locale, onUseDirection }: ToneDriftAlertProps) {
  if (isLoading) {
    return (
      <p role="status" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {locale === "en" ? "Checking voice alignment…" : "正在检查声音契合度…"}
      </p>
    );
  }

  if (!assessment || assessment.status === "unavailable") {
    return assessment ? (
      <p className="mt-2 text-xs text-fg-muted">
        {locale === "en" ? "Voice alignment will appear after you have reference posts or Brand Memory examples." : "积累参考内容或品牌记忆示例后，这里会显示声音契合度。"}
      </p>
    ) : null;
  }

  const score = assessment.score ?? 0;
  const lowConfidence = assessment.confidence === "low";
  const isDrift = assessment.status === "drift" && !lowConfidence;
  const isWatch = assessment.status === "watch";
  const direction = locale === "en" ? assessment.directionEn : assessment.directionZh;

  if (assessment.status === "aligned") {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-positive">
        <Check className="h-3.5 w-3.5 shrink-0" />
        {locale === "en"
          ? `Voice alignment ${score}/100 · based on ${baselineLabel(assessment, locale)}`
          : `声音契合度 ${score}/100 · 基于${baselineLabel(assessment, locale)}`}
      </p>
    );
  }

  const heading = isDrift
    ? (locale === "en" ? `Voice may drift from ${baselineLabel(assessment, locale)}` : `当前声音可能偏离${baselineLabel(assessment, locale)}`)
    : lowConfidence
      ? (locale === "en" ? "Voice reference is still learning" : "声音参考仍在学习中")
      : (locale === "en" ? "Voice alignment is worth a quick review" : "建议快速检查声音契合度");

  return (
    <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${isDrift ? "border-warn/25 bg-warn/10 text-warn" : "border-hairline bg-surface-2 text-fg-muted"}`}>
      <div className="flex items-start gap-1.5">
        {isDrift ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fg">{heading}</p>
          <p className="mt-0.5">
            {locale === "en"
              ? `Voice alignment ${score}/100 · ${baselineLabel(assessment, locale)}${lowConfidence ? " · low confidence" : ""}`
              : `声音契合度 ${score}/100 · 基于${baselineLabel(assessment, locale)}${lowConfidence ? " · 低置信度" : ""}`}
          </p>
          {isDrift && assessment.differences.length > 0 ? (
            <ul className="mt-1.5 grid gap-1">
              {assessment.differences.map((difference) => (
                <li key={difference.key} className="leading-5">{locale === "en" ? difference.reasonEn : difference.reasonZh}</li>
              ))}
            </ul>
          ) : null}
          {isDrift && direction && onUseDirection ? (
            <button
              type="button"
              onClick={() => onUseDirection(direction)}
              className="focus-ring mt-2 inline-flex items-center gap-1 rounded-md border border-current/25 bg-surface/70 px-2 py-1 text-[11px] font-semibold text-fg transition hover:bg-surface"
            >
              <Sparkles className="h-3 w-3" />
              {locale === "en" ? "Use this direction" : "使用此修改方向"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}