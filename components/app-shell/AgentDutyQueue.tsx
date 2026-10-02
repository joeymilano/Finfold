"use client";

import { ArrowUpRight, CheckCircle2, Clock3, History, Loader2, Radio, RefreshCw, X } from "@/components/ui/icons";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { addToast } from "@/components/ui/Toast";
import type { AgentPatrolItem, PatrolUrgency } from "@/lib/agent/patrol";

export function AgentDutyQueue({ locale }: { locale: "zh" | "en" }) {
  const [item, setItem] = useState<AgentPatrolItem | null>(null);
  const [items, setItems] = useState<AgentPatrolItem[]>([]);
  const [backgroundEligible, setBackgroundEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<"done" | "dismissed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/patrol", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = (await response.json().catch(() => ({}))) as {
        openItem?: AgentPatrolItem | null;
        items?: AgentPatrolItem[];
        backgroundEligible?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Agent patrol failed.");
      setItem(data.openItem ?? null);
      setItems(data.items ?? []);
      setBackgroundEligible(Boolean(data.backgroundEligible));
    } catch {
      setError(locale === "en" ? "Duty check is temporarily unavailable." : "智能体值班巡检暂时不可用。");
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function updateStatus(status: "done" | "dismissed") {
    if (!item || updating) return;
    setUpdating(status);
    try {
      const response = await fetch(`/api/agent/patrol/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = (await response.json().catch(() => ({}))) as {
        openItem?: AgentPatrolItem | null;
        items?: AgentPatrolItem[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Duty update failed.");
      setItem(data.openItem ?? null);
      setItems(data.items ?? []);
      addToast(
        "success",
        status === "done"
          ? (locale === "en" ? "Review completed. The next action is ready." : "复盘已完成，下一项任务已接续。")
          : (locale === "en" ? "Duty item dismissed." : "已忽略这条值班任务。")
      );
    } catch (caught) {
      addToast(
        "error",
        caught instanceof Error
          ? caught.message
          : locale === "en"
            ? "Could not update this duty item."
            : "暂时无法更新这条任务。"
      );
    } finally {
      setUpdating(null);
    }
  }

  if (loading && !item) {
    return (
      <div className="mt-5 grid min-h-28 animate-pulse grid-cols-[6px_minmax(0,1fr)] overflow-hidden rounded-xl border border-white/10 bg-black/25">
        <div className="bg-action/50" />
        <div className="p-4">
          <div className="h-3 w-40 bg-white/[0.07]" />
          <div className="mt-4 h-5 w-2/3 bg-white/[0.07]" />
          <div className="mt-3 h-3 w-full bg-white/[0.05]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-5 flex items-center justify-between gap-3 border-y border-white/10 bg-white/[0.025] px-4 py-3">
        <p className="text-xs font-semibold text-white/45">{error}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="focus-ring inline-flex items-center gap-1.5 text-xs font-bold text-action"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {locale === "en" ? "Retry" : "重试"}
        </button>
      </div>
    );
  }

  if (!item) {
    return (
      <div>
        <div className="mt-5 flex items-center gap-3 border-y border-white/10 bg-white/[0.025] px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-positive" />
          <div>
            <p className="text-xs font-bold text-white/75">
              {locale === "en" ? "Duty queue clear" : "值班队列已清空"}
            </p>
            <p className="mt-0.5 text-[11px] text-white/38">
              {locale === "en" ? "No unresolved next action right now." : "目前没有未处理的下一步。"}
            </p>
          </div>
        </div>
        <DutyHistory items={items} locale={locale} />
      </div>
    );
  }

  const title = item.title[locale];
  const detail = item.detail[locale];
  const evidence = item.evidence[locale];

  return (
    <div>
      <section className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-[#090b0f]">
        <div className="grid grid-cols-[6px_minmax(0,1fr)]">
          <div className={urgencyRail(item.urgency)} />
          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-action">
                  <Radio className="h-3.5 w-3.5" />
                  {locale === "en" ? "Agent on duty" : "智能体正在值班"}
                </span>
                <span className={`border px-2 py-0.5 text-[10px] font-bold uppercase ${urgencyBadge(item.urgency)}`}>
                  {urgencyLabel(item.urgency, locale)}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/28">
                  <Clock3 className="h-3 w-3" />
                  {backgroundEligible
                    ? (locale === "en" ? "checked daily in background" : "每天后台巡检")
                    : (locale === "en" ? "checked when you open Agent" : "打开智能体时巡检")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {item.actionKind === "mission_review" ? (
                  <button
                    type="button"
                    onClick={() => void updateStatus("done")}
                    disabled={Boolean(updating)}
                    className="focus-ring inline-flex items-center gap-1.5 border border-positive/25 bg-positive/10 px-2 py-1 text-[11px] font-bold text-positive transition hover:bg-positive/15 disabled:opacity-40"
                  >
                    {updating === "done" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {locale === "en" ? "Review complete" : "完成复盘"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void updateStatus("dismissed")}
                  disabled={Boolean(updating)}
                  className="focus-ring inline-flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-semibold text-white/32 transition hover:text-white disabled:opacity-40"
                  aria-label={locale === "en" ? "Dismiss duty item" : "忽略值班任务"}
                >
                  {updating === "dismissed" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  {locale === "en" ? "Dismiss" : "忽略"}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
              <div>
                <h2 className="text-lg font-black leading-snug text-white sm:text-xl">{title}</h2>
                <p className="mt-1.5 max-w-3xl text-sm leading-6 text-white/55">{detail}</p>
                <p className="mt-3 border-l-2 border-white/12 pl-3 font-mono text-[11px] leading-5 text-white/38">
                  {evidence}
                </p>
              </div>
              <Link href={item.actionHref} className="focus-ring inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-action/55 bg-action px-4 text-xs font-bold text-on-action transition hover:bg-action-strong">
                {actionLabel(item, locale)}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <DutyHistory items={items.filter((candidate) => candidate.id !== item.id)} locale={locale} />
    </div>
  );
}

function DutyHistory({ items, locale }: { items: AgentPatrolItem[]; locale: "zh" | "en" }) {
  const recent = items
    .filter((item) => item.status !== "open")
    .slice(0, 4);
  if (recent.length === 0) return null;

  return (
    <details className="group mt-2 border-t border-white/[0.06]">
      <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 px-1 py-2 text-[11px] font-bold text-white/30 transition hover:text-white/55">
        <History className="h-3.5 w-3.5" />
        {locale === "en" ? "Recent duty log" : "最近值班记录"}
        <span className="font-mono text-[10px] text-white/20">{String(recent.length).padStart(2, "0")}</span>
      </summary>
      <div className="grid gap-px border border-white/[0.07] bg-white/[0.07]">
        {recent.map((entry) => (
          <div key={entry.id} className="grid gap-1 bg-[#0b0d11] px-3 py-2.5 sm:grid-cols-[90px_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
            <span className={`text-[10px] font-black uppercase tracking-[0.12em] ${historyStatusClass(entry.status)}`}>
              {historyStatusLabel(entry.status, locale)}
            </span>
            <span className="truncate text-xs font-semibold text-white/55">{entry.title[locale]}</span>
            <time className="font-mono text-[10px] text-white/22" dateTime={entry.completedAt ?? entry.updatedAt}>
              {formatHistoryTime(entry.completedAt ?? entry.updatedAt, locale)}
            </time>
          </div>
        ))}
      </div>
    </details>
  );
}

function actionLabel(item: AgentPatrolItem, locale: "zh" | "en"): string {
  if (typeof item.sourceState.anomalyId === "string") {
    return locale === "en" ? "Investigate alert" : "调查这个异常";
  }
  const labels = locale === "en"
    ? {
        mission_generate: "Generate mission draft",
        mission_publish: "Review and publish",
        mission_measure: "Add experiment results",
        mission_review: "Review verdict",
        measure_results: "Add post results",
        review_drafts: "Review drafts",
        new_experiment: "Plan next experiment",
        first_measured_post: "Start measurable post",
        xhs_positioning: "Confirm positioning",
        xhs_topic: "Choose topic",
        xhs_draft: "Prepare note",
        xhs_title: "Choose title",
        xhs_visual: "Build visuals",
        xhs_publish: "Create and publish",
        xhs_review: "Review results",
        operating_publish: "Prepare next post"
      }
    : {
        mission_generate: "生成任务内容",
        mission_publish: "检查并发布",
        mission_measure: "回填实验结果",
        mission_review: "复盘实验结论",
        measure_results: "补上发布结果",
        review_drafts: "审阅草稿",
        new_experiment: "规划下一轮实验",
        first_measured_post: "开始可测量内容",
        xhs_positioning: "确认账号定位",
        xhs_topic: "选择下一选题",
        xhs_draft: "准备真实内容",
        xhs_title: "选择标题实验",
        xhs_visual: "制作视觉方案",
        xhs_publish: "创作并发布",
        xhs_review: "复盘真实结果",
        operating_publish: "准备下一篇"
      };
  return labels[item.actionKind];
}

function urgencyLabel(urgency: PatrolUrgency, locale: "zh" | "en"): string {
  if (urgency === "overdue") return locale === "en" ? "Overdue" : "已到期";
  if (urgency === "today") return locale === "en" ? "Today" : "今天";
  return locale === "en" ? "Planned" : "已计划";
}

function urgencyRail(urgency: PatrolUrgency): string {
  if (urgency === "overdue") return "bg-negative";
  if (urgency === "today") return "bg-brand";
  return "bg-white/15";
}

function urgencyBadge(urgency: PatrolUrgency): string {
  if (urgency === "overdue") return "border-negative/35 bg-negative/10 text-negative";
  if (urgency === "today") return "border-brand/35 bg-brand/10 text-brand";
  return "border-white/10 bg-white/[0.03] text-white/40";
}

function historyStatusLabel(status: AgentPatrolItem["status"], locale: "zh" | "en"): string {
  const labels = locale === "en"
    ? { open: "Open", done: "Completed", dismissed: "Dismissed", superseded: "Advanced" }
    : { open: "进行中", done: "已完成", dismissed: "已忽略", superseded: "已推进" };
  return labels[status];
}

function historyStatusClass(status: AgentPatrolItem["status"]): string {
  if (status === "done") return "text-positive";
  if (status === "dismissed") return "text-white/25";
  return "text-brand/65";
}

function formatHistoryTime(value: string, locale: "zh" | "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale === "en" ? "en-US" : "zh-CN", {
    month: "short",
    day: "numeric"
  });
}
