"use client";

import React from "react";
import { ArrowDown, Check, FileText, Layers3, Sparkles } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";

type FirstKitGuideProps = {
  locale: Locale;
  sourceLength: number;
  platformCount: number;
  onStart: () => void;
};

export function FirstKitGuide({
  locale,
  sourceLength,
  platformCount,
  onStart
}: FirstKitGuideProps) {
  const sourceReady = sourceLength >= 20;
  const platformsReady = platformCount > 0;
  const completedSteps = Number(sourceReady) + Number(platformsReady);
  const progress = Math.round((completedSteps / 3) * 100);
  const isEnglish = locale === "en";

  const steps = [
    {
      icon: FileText,
      done: sourceReady,
      title: isEnglish ? "Add a real source" : "放入一份真实素材",
      detail: sourceReady
        ? isEnglish
          ? `${sourceLength} characters ready`
          : `已准备 ${sourceLength} 个字`
        : isEnglish
          ? `${Math.max(0, 20 - sourceLength)} more characters needed`
          : `还需要 ${Math.max(0, 20 - sourceLength)} 个字`
    },
    {
      icon: Layers3,
      done: platformsReady,
      title: isEnglish ? "Choose destinations" : "确认发布渠道",
      detail: platformsReady
        ? isEnglish
          ? `${platformCount} platforms selected`
          : `已选择 ${platformCount} 个平台`
        : isEnglish
          ? "Select at least one platform"
          : "至少选择一个平台"
    },
    {
      icon: Sparkles,
      done: false,
      title: isEnglish ? "Create your first kit" : "生成第一份内容包",
      detail: isEnglish
        ? "Your saved history begins here"
        : "从这里开始积累真实内容资产"
    }
  ];

  return (
    <section className="relative isolate overflow-hidden rounded-xl border border-brand/25 bg-surface p-5 shadow-panel sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_8%_12%,rgb(var(--brand)/0.2),transparent_28%),linear-gradient(115deg,transparent_40%,rgb(var(--accent)/0.08))]"
      />
      <div aria-hidden className="grain-local pointer-events-none absolute inset-0 -z-10 opacity-50" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(560px,1.2fr)] xl:items-end">
        <div>
          <p className="eyebrow">
            {isEnglish ? "FIRST CONTENT KIT" : "第一份内容包"}
          </p>
          <h2 className="mt-3 max-w-xl text-2xl font-black tracking-tight text-fg sm:text-3xl">
            {isEnglish
              ? "Start with something only you know."
              : "从只有你知道的真实素材开始。"}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-fg-muted">
            {isEnglish
              ? "Paste a launch note, customer insight, product update, or founder memo. Finfold will preserve the source and adapt it for each channel."
              : "粘贴发布说明、客户洞察、产品更新或创始人备忘录。Finfold 会保留事实来源，再为每个渠道重新组织表达。"}
          </p>

          <div className="mt-5 flex items-center gap-3">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label={isEnglish ? "First kit progress" : "首份内容包进度"}
            >
              <span
                className="block h-full rounded-full bg-gradient-to-r from-brand-strong via-brand to-accent transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="font-mono text-[11px] font-semibold text-fg-muted">
              {completedSteps}/3
            </span>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-3">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className={`relative rounded-lg border p-3.5 ${
                step.done
                  ? "border-positive/25 bg-positive/10"
                  : index === completedSteps
                    ? "border-brand/35 bg-brand/10"
                    : "border-hairline bg-surface/70"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-md ${
                    step.done
                      ? "bg-positive/15 text-positive"
                      : "bg-surface-2 text-fg-muted"
                  }`}
                >
                  {step.done ? <Check className="h-4 w-4" /> : <step.icon className="h-4 w-4" />}
                </span>
                <span className="font-mono text-[10px] text-fg-muted/70">
                  0{index + 1}
                </span>
              </div>
              <p className="mt-3 text-sm font-bold text-fg">{step.title}</p>
              <p className="mt-1 text-[11px] leading-5 text-fg-muted">{step.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-fg-muted">
          {isEnglish
            ? "No sample kit will be mixed into your workspace."
            : "工作区不会混入示例内容，你看到的每一项都会来自真实生成。"}
        </p>
        <button
          type="button"
          onClick={onStart}
          className="btn-primary focus-ring inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2.5 text-sm"
        >
          <ArrowDown className="h-4 w-4" />
          {sourceReady
            ? isEnglish
              ? "Continue setup"
              : "继续完成设置"
            : isEnglish
              ? "Add my first source"
              : "粘贴第一份素材"}
        </button>
      </div>
    </section>
  );
}
