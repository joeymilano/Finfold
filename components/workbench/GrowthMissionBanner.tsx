"use client";

import { Activity, ArrowUpRight, CheckCircle2, Target } from "@/components/ui/icons";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import type { GrowthMission } from "@/lib/agent/growth-missions";

export function GrowthMissionBanner({
  missionId,
  locale
}: {
  missionId: string;
  locale: "zh" | "en";
}) {
  const [mission, setMission] = useState<GrowthMission | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadMission() {
      try {
        const response = await fetch(`/api/agent/missions/${missionId}`, { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { mission?: GrowthMission };
        if (active && response.ok && data.mission) setMission(data.mission);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadMission();
    return () => {
      active = false;
    };
  }, [missionId]);

  if (loading) {
    return <div className="h-28 animate-pulse rounded-md border border-brand/20 bg-brand/5" />;
  }
  if (!mission) return null;

  const isCompleted = mission.status === "completed";
  const metricActual = mission.outcome?.actualValue;

  return (
    <section className="relative overflow-hidden rounded-md border border-brand/30 bg-surface shadow-panel">
      <div className="absolute inset-y-0 left-0 w-1 bg-brand" />
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.75fr)] lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-brand">
              <Activity className="h-3.5 w-3.5" />
              {locale === "en" ? "Growth Mission attached" : "已绑定 Growth Mission"}
            </span>
            <span className="rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-fg-muted">
              {missionStatusLabel(mission.status, locale)}
            </span>
          </div>
          <h2 className="mt-2 text-lg font-black leading-snug text-fg sm:text-xl">{mission.title}</h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-fg-muted">{mission.hypothesis}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {mission.variants.map((variant) => (
              <span key={variant.name} className="rounded-sm border border-brand/20 bg-brand/8 px-2 py-1 text-[10px] font-bold text-brand">
                {variant.name}
              </span>
            ))}
          </div>
        </div>

        <div className="border-t border-hairline pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-fg-muted">
            {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5 text-positive" /> : <Target className="h-3.5 w-3.5 text-brand" />}
            {locale === "en" ? "Single success metric" : "唯一成功指标"}
          </p>
          <p className="mt-1.5 text-sm font-bold text-fg">{mission.primaryMetric}</p>
          <div className="mt-2 flex items-end gap-2 font-mono">
            <span className="text-lg font-bold text-fg-muted">{formatMetric(mission.baselineValue)}</span>
            <span className="pb-0.5 text-xs text-fg-subtle">→</span>
            <span className="text-2xl font-black text-brand">
              {isCompleted && metricActual !== undefined ? formatMetric(metricActual) : formatMetric(mission.targetValue)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-fg-subtle">
            {isCompleted
              ? (locale === "en" ? `Verdict: ${mission.verdict ?? "inconclusive"}` : `结果：${verdictLabel(mission.verdict, locale)}`)
              : (locale === "en" ? "baseline → target" : "基线 → 达标线")}
          </p>
          <Link href="/dashboard" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:underline">
            {locale === "en" ? "Return to Growth Agent" : "返回增长 Agent"}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function missionStatusLabel(status: GrowthMission["status"], locale: "zh" | "en"): string {
  const labels = locale === "en"
    ? {
        accepted: "Accepted",
        draft_ready: "Draft ready",
        posted: "Waiting for data",
        completed: "Completed",
        dismissed: "Dismissed",
        superseded: "Superseded"
      }
    : {
        accepted: "已接受",
        draft_ready: "草稿已生成",
        posted: "等待数据",
        completed: "已判定",
        dismissed: "已关闭",
        superseded: "已替换"
      };
  return labels[status];
}

function verdictLabel(verdict: GrowthMission["verdict"], locale: "zh" | "en"): string {
  if (locale === "en") return verdict ?? "inconclusive";
  if (verdict === "won") return "实验胜出";
  if (verdict === "lost") return "实验未胜出";
  return "证据不足";
}

function formatMetric(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
