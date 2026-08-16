"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardList, Radio, Sparkles } from "@/components/ui/icons";
import { DismissButton, useDismissable } from "@/components/ui/Dismissible";
import type { GrowthSummary } from "@/components/app-shell/OperatingDashboard";

/**
 * Agent 值班卡（P1-3）：Dashboard 顶部常驻的"本周计划"，把 Dashboard 从"被动
 * 看指标"变成"AI 同事告诉你今天该做什么"。建议全部基于真实 summary 数据
 *（kit 历史 + 发布状态）；数据不足时给冷启动默认节奏并标注"示例"。
 */
type Props = {
  summary: GrowthSummary;
  locale: "zh" | "en";
};

type Suggestion = {
  id: string;
  icon: "duty" | "stale" | "review" | "measure" | "default";
  text: string;
  href: string;
  cta: string;
  isSample?: boolean;
};

export function WeeklyPlanCard({ summary, locale }: Props) {
  const isZh = locale === "zh";
  const suggestions: Suggestion[] = [];
  const dutyItem = summary.dutyItem?.status === "open" ? summary.dutyItem : null;

  if (dutyItem) {
    suggestions.push({
      id: `duty:${dutyItem.id}`,
      icon: "duty",
      text: `${dutyItem.title[locale]}。${dutyItem.detail[locale]}`,
      href: dutyItem.actionHref,
      cta: dutyActionLabel(dutyItem, locale)
    });
  }

  // 断更提醒：从没发过，或距上次发布 ≥3 天，且本周为 0。
  const days = summary.daysSinceLastPublish;
  const stale = days === null || days >= 3;
  if (!dutyItem && stale && summary.publishedThisWeek === 0) {
    const when = days === null
      ? (isZh ? "还没发布过" : "never published")
      : (isZh ? `已 ${days} 天没发` : `${days} days since last post`);
    suggestions.push({
      id: "stale",
      icon: "stale",
      text: isZh
        ? `${when}。本周尚未更新，建议今天就发一条保持活跃。`
        : `${when}. No update this week — publish one today to stay in the feed.`,
      href: "/workbench",
      cta: isZh ? "去生成" : "Generate"
    });
  }

  // 待审阅草稿。
  if (!dutyItem && summary.toReview > 0) {
    suggestions.push({
      id: "review",
      icon: "review",
      text: isZh
        ? `有 ${summary.toReview} 条草稿待你审阅、发布。`
        : `${summary.toReview} draft${summary.toReview > 1 ? "s" : ""} waiting for your review.`,
      href: "/packages",
      cta: isZh ? "去审阅" : "Review"
    });
  }

  // 已发布但没回填效果 → 闭环飞轮。
  if (!dutyItem && summary.awaitingMetrics > 0) {
    suggestions.push({
      id: "measure",
      icon: "measure",
      text: isZh
        ? `${summary.awaitingMetrics} 条已发布、缺效果数据，回填后下一轮更准。`
        : `${summary.awaitingMetrics} published without results — add them to tune the next kit.`,
      href: "/packages",
      cta: isZh ? "回填效果" : "Add results"
    });
  }

  // 冷启动：无任何信号 → 默认节奏（标注示例）。
  if (suggestions.length === 0) {
    suggestions.push({
      id: "default",
      icon: "default",
      text: isZh
        ? "示例节奏：每周 2 条 X / LinkedIn + 1 条小红书，稳定触达。"
        : "Sample cadence: 2 X/LinkedIn posts + 1 Xiaohongshu per week.",
      href: "/workbench",
      cta: isZh ? "开始第一篇" : "Start first",
      isSample: true
    });
  }

  // 同一批建议被关闭后不重复打扰；建议发生变化（指纹不同）时自然浮现。14 天兜底重显。
  const weeklyPlanKey = `finfold-weekly-plan-v1:${suggestions.map((s) => s.id).join("|")}`;
  const { dismissed, dismiss } = useDismissable(weeklyPlanKey, { expireDays: 14 });
  if (dismissed) return null;

  const iconFor = (icon: Suggestion["icon"]) => {
    switch (icon) {
      case "duty": return <Radio className="h-4 w-4 text-brand" />;
      case "stale": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "review": return <ClipboardList className="h-4 w-4 text-brand" />;
      case "measure": return <CheckCircle2 className="h-4 w-4 text-accent" />;
      default: return <Sparkles className="h-4 w-4 text-fg-muted" />;
    }
  };

  return (
    <section className="panel relative p-5 pr-12">
      <DismissButton onClick={dismiss} label={isZh ? "关闭本周建议" : "Dismiss"} />
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/15 text-brand">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-sm font-semibold text-fg">
          {isZh ? "本周值班建议" : "This week's shift"}
        </h2>
        <span className="ml-auto text-[11px] text-fg-muted">
          {isZh ? "Agent 整理" : "Curated by your agent"}
        </span>
      </div>
      <div className="grid gap-2.5">
        {suggestions.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-2/50 p-3">
            <span className="shrink-0">{iconFor(s.icon)}</span>
            <p className="min-w-0 flex-1 text-xs leading-5 text-fg">
              {s.text}
              {s.isSample ? (
                <span className="ml-1.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-fg-muted">
                  {isZh ? "示例" : "sample"}
                </span>
              ) : null}
            </p>
            <Link href={s.href} className="btn-ghost focus-ring shrink-0 px-2.5 py-1 text-[11px]">
              {s.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function dutyActionLabel(
  item: NonNullable<GrowthSummary["dutyItem"]>,
  locale: "zh" | "en"
): string {
  if (typeof item.sourceState.anomalyId === "string") {
    return locale === "en" ? "Investigate" : "调查异常";
  }
  const labels = locale === "en"
    ? {
        mission_generate: "Generate",
        mission_publish: "Publish",
        mission_measure: "Add results",
        mission_review: "Review",
        measure_results: "Add results",
        review_drafts: "Review",
        new_experiment: "Plan",
        first_measured_post: "Start",
        xhs_positioning: "Position",
        xhs_topic: "Choose",
        xhs_draft: "Prepare",
        xhs_title: "Choose",
        xhs_visual: "Build",
        xhs_publish: "Publish",
        xhs_review: "Review"
      }
    : {
        mission_generate: "去生成",
        mission_publish: "去发布",
        mission_measure: "回填结果",
        mission_review: "去复盘",
        measure_results: "补上效果",
        review_drafts: "去审阅",
        new_experiment: "去规划",
        first_measured_post: "开始",
        xhs_positioning: "去定位",
        xhs_topic: "选选题",
        xhs_draft: "写内容",
        xhs_title: "选标题",
        xhs_visual: "做视觉",
        xhs_publish: "去发布",
        xhs_review: "去复盘"
      };
  return labels[item.actionKind];
}
