"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, ChevronDown, Loader2 } from "@/components/ui/icons";
import { getLocalizedPlatformLabel } from "@/lib/platforms";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import { captureEvent } from "@/lib/posthog";
import type { Locale } from "@/lib/i18n";
import type { CampaignPlan, CampaignDay } from "@/lib/campaign";

type Props = { locale: Locale };

/**
 * 7 天内容计划卡（P1-3 增强 + P2-2 LLM 理由 + P2-5 持久化/完成态）：
 * 消费 /api/campaign（buildCampaignPlan + explainCampaignPlan，持久化到
 * campaign_plans 表）。每行可标记完成（PATCH），"去生成"带当天 angle + 主平台
 * query 预填到 workbench。无 kit 时静默不渲染，由 WeeklyPlanCard 兜底。
 */
export function CampaignPlanCard({ locale }: Props) {
  const isZh = locale === "zh";
  const [plan, setPlan] = useState<CampaignPlan | null>(null);
  const [completedDays, setCompletedDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [progressTrackingAvailable, setProgressTrackingAvailable] = useState(true);
  const [togglingDay, setTogglingDay] = useState<number | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/campaign?locale=${locale}`, { cache: "no-store" });
        const data = (await response.json()) as {
          plan?: CampaignPlan | null;
          completedDays?: number[];
          progressTrackingAvailable?: boolean;
        };
        if (cancelled) return;
        setPlan(data.plan ?? null);
        setCompletedDays(Array.isArray(data.completedDays) ? data.completedDays : []);
        setProgressTrackingAvailable(data.progressTrackingAvailable !== false);
      } catch {
        if (!cancelled) setPlan(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  async function toggleDay(day: number) {
    if (togglingDay !== null || !progressTrackingAvailable) return;

    const previousDays = completedDays;
    const nextDays = previousDays.includes(day)
      ? previousDays.filter((item) => item !== day)
      : [...previousDays, day].sort((a, b) => a - b);

    setToggleError(null);
    setCompletedDays(nextDays);
    setTogglingDay(day);
    let responseStatus: number | null = null;
    try {
      const response = await fetch("/api/campaign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day })
      });
      responseStatus = response.status;
      const data = (await response.json()) as { completedDays?: number[]; error?: string };
      if (!response.ok || !Array.isArray(data.completedDays)) {
        throw new Error(data.error ?? "Failed to update campaign progress.");
      }

      setCompletedDays(data.completedDays);
      captureEvent("campaign_day_toggled", { day, completed: data.completedDays.includes(day) });
    } catch {
      setCompletedDays(previousDays);
      setToggleError(getProgressErrorMessage(responseStatus, isZh));
    } finally {
      setTogglingDay(null);
    }
  }

  if (loading) {
    return (
      <section className="panel p-5">
        <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />
      </section>
    );
  }

  // 无 kit / 数据不足 → 静默（WeeklyPlanCard 的冷启动建议已兜底）。
  if (!plan) return null;

  const completedCount = plan.days.filter((d) => completedDays.includes(d.day)).length;
  const progressPercent = Math.round((completedCount / plan.days.length) * 100);

  return (
    <section className="panel overflow-hidden">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <CalendarDays className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-sm font-semibold text-fg">
                {isZh ? "本周 7 天内容计划" : "7-day content plan"}
              </h2>
              <span className="text-[11px] font-semibold text-fg-muted">
                {isZh ? `已完成 ${completedCount}/${plan.days.length}` : `${completedCount}/${plan.days.length} done`}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-fg-muted">{plan.strategy}</p>
            <div className="mt-2 h-1 max-w-56 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <div className="h-full rounded-full bg-positive transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPlanExpanded((current) => !current)}
            aria-expanded={planExpanded}
            aria-controls="campaign-plan-days"
            className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          >
            {planExpanded ? (isZh ? "收起" : "Collapse") : (isZh ? "展开计划" : "Show plan")}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${planExpanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {planExpanded ? (
        <div id="campaign-plan-days" className="border-t border-hairline p-3 md:p-4">
          {!progressTrackingAvailable ? (
            <p className="mb-3 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs font-semibold leading-5 text-warn" role="status">
              {isZh
                ? "完成进度暂时无法保存；内容计划和“去生成”仍可正常使用。"
                : "Progress saving is temporarily unavailable. The plan and Generate actions still work."}
            </p>
          ) : (
            <p className="mb-3 px-1 text-[11px] leading-5 text-fg-muted">
              {isZh ? "点“完成”会保存本周执行进度，再次点击可撤销。" : "Marking an item done saves this week's progress; click again to undo."}
            </p>
          )}
          {toggleError ? (
            <p className="mb-3 rounded-lg border border-risk/25 bg-risk/10 px-3 py-2 text-xs font-semibold leading-5 text-risk" role="alert">
              {toggleError}
            </p>
          ) : null}
          <div className="grid gap-2">
            {plan.days.map((day) => (
              <PlanRow
                key={day.day}
                day={day}
                isZh={isZh}
                completed={completedDays.includes(day.day)}
                expanded={expandedDay === day.day}
                toggling={togglingDay === day.day}
                completionDisabled={!progressTrackingAvailable || togglingDay !== null}
                onToggle={() => void toggleDay(day.day)}
                onToggleDetails={() => setExpandedDay((current) => (current === day.day ? null : day.day))}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PlanRow({
  day,
  isZh,
  completed,
  expanded,
  toggling,
  completionDisabled,
  onToggle,
  onToggleDetails
}: {
  day: CampaignDay;
  isZh: boolean;
  completed: boolean;
  expanded: boolean;
  toggling: boolean;
  completionDisabled: boolean;
  onToggle: () => void;
  onToggleDetails: () => void;
}) {
  const platformLabel = getLocalizedPlatformLabel(day.primaryPlatform, isZh ? "zh" : "en", true);
  // "去生成"带当天 angle + 主平台 query → workbench 预填（P2-5 执行今天）。
  const workbenchHref = `/workbench?idea=${encodeURIComponent(day.angle)}&platform=${day.primaryPlatform}`;
  return (
    <div className={`overflow-hidden rounded-lg border transition-colors ${completed ? "border-positive/30 bg-positive/5" : "border-hairline bg-surface-2/35"}`}>
      <div className="flex flex-wrap items-center gap-2 p-2.5 md:flex-nowrap md:gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={completed}
          aria-label={completed ? (isZh ? `撤销第 ${day.day} 天完成` : `Mark day ${day.day} incomplete`) : (isZh ? `标记第 ${day.day} 天完成` : `Mark day ${day.day} done`)}
          onClick={onToggle}
          disabled={completionDisabled}
          className={`focus-ring inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            completed
              ? "border-positive bg-positive text-white"
              : "border-hairline bg-surface text-fg-muted hover:border-positive/50 hover:text-positive"
          }`}
        >
          {toggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className={`h-3.5 w-3.5 ${completed ? "" : "opacity-45"}`} />}
          {toggling ? (isZh ? "保存中" : "Saving") : completed ? (isZh ? "已完成" : "Done") : (isZh ? "完成" : "Done")}
        </button>

        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold text-brand">D{day.day}</span>
            <p className={`truncate text-xs font-semibold leading-5 ${completed ? "text-fg-muted line-through" : "text-fg"}`}>{day.theme}</p>
          </div>
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-fg-muted">
            <PlatformGlyph platform={day.primaryPlatform} className="h-3 w-3" />
            {platformLabel}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleDetails}
            aria-expanded={expanded}
            aria-controls={`campaign-day-${day.day}-details`}
            aria-label={expanded ? (isZh ? `收起第 ${day.day} 天详情` : `Hide day ${day.day} details`) : (isZh ? `查看第 ${day.day} 天详情` : `Show day ${day.day} details`)}
            className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-fg-muted transition hover:bg-surface hover:text-fg"
          >
            {isZh ? "详情" : "Details"}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          <Link
            href={workbenchHref}
            className="btn-ghost focus-ring min-h-9 shrink-0 px-2.5 py-2 text-[11px]"
          >
            {isZh ? "去生成" : "Generate"}
          </Link>
        </div>
      </div>

      {expanded ? (
        <div id={`campaign-day-${day.day}-details`} className="grid gap-3 border-t border-hairline bg-surface/55 px-3 py-3 md:grid-cols-3">
          <PlanDetail label={isZh ? "内容角度" : "Angle"} value={day.angle} />
          {day.rationale ? <PlanDetail label={isZh ? "策略依据" : "Why"} value={day.rationale} accent /> : null}
          <PlanDetail label={isZh ? "行动目标" : "Call to action"} value={day.cta} />
        </div>
      ) : null}
    </div>
  );
}

function PlanDetail({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className={`text-[10px] font-bold uppercase tracking-wide ${accent ? "text-accent" : "text-fg-muted"}`}>{label}</p>
      <p className="mt-1 text-[11px] leading-5 text-fg-muted">{value}</p>
    </div>
  );
}

function getProgressErrorMessage(status: number | null, isZh: boolean) {
  if (status === 404) {
    return isZh
      ? "这份计划还没完成同步，暂时无法保存进度。刷新页面后再试。"
      : "This plan has not finished syncing, so progress cannot be saved yet. Refresh and try again.";
  }
  if (status === 503) {
    return isZh
      ? "进度服务暂时不可用，请稍后再试。"
      : "Progress saving is temporarily unavailable. Try again shortly.";
  }
  return isZh
    ? "完成状态没有保存成功，已恢复原状态。请重试。"
    : "The completion state was not saved and has been restored. Please try again.";
}
