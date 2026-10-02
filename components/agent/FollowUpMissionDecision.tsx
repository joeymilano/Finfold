"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ShieldCheck, Target } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import type { GrowthMission } from "@/lib/agent/growth-missions";
import { captureEvent } from "@/lib/posthog";

type FollowUpMissionDecisionProps = {
  mission: GrowthMission;
  locale: "zh" | "en";
};

export function FollowUpMissionDecision({ mission, locale }: FollowUpMissionDecisionProps) {
  const router = useRouter();
  const en = locale === "en";
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decision = followUpDecisionCopy(mission.verdict, locale);

  async function startFollowUp() {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          platform: mission.platform,
          sourceMissionId: mission.id
        })
      });
      const data = await response.json().catch(() => ({})) as {
        mission?: GrowthMission | null;
        existing?: boolean;
        error?: string;
      };
      if (!response.ok || !data.mission) {
        throw new Error(data.error ?? (en ? "Unable to create the next mission." : "暂时无法创建下一轮任务。"));
      }
      captureEvent("follow_up_mission_confirmed", {
        sourceMissionId: mission.id,
        sourceVerdict: mission.verdict,
        missionId: data.mission.id,
        existing: Boolean(data.existing)
      });
      router.push(`/operations/missions/${data.mission.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (en ? "Unable to create the next mission." : "暂时无法创建下一轮任务。"));
      setStarting(false);
    }
  }

  return (
    <Panel className="overflow-hidden border-action/35 bg-action/[0.045]">
      <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <div className="p-5 md:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-action/12 text-action-strong dark:text-action">
              {mission.verdict === "won" ? <CheckCircle2 className="h-5 w-5" /> : <Target className="h-5 w-5" />}
            </span>
            <div>
              <p className="eyebrow">{en ? "NEXT-CYCLE DECISION" : "下一轮决策"}</p>
              <h3 className="mt-2 text-xl font-black text-fg">{decision.title}</h3>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-fg-muted">{decision.detail}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
            <div className="rounded-xl border border-hairline bg-surface/70 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-fg-muted">{en ? "Measured evidence" : "本轮真实证据"}</p>
              <p className="mt-1 text-sm font-black text-fg">
                {mission.primaryMetric} · {formatMetric(mission.outcome?.actualValue)} / {formatMetric(mission.targetValue)}
              </p>
            </div>
            <ArrowRight className="mx-auto hidden h-4 w-4 text-action sm:block" />
            <div className="rounded-xl border border-action/25 bg-action/[0.07] p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-fg-muted">{en ? "Next-cycle rule" : "下一轮约束"}</p>
              <p className="mt-1 text-sm font-black text-fg">{en ? "Change one bottleneck, keep the rest stable" : "只改变一个瓶颈，其余保持不变"}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-hairline bg-surface/45 p-5 md:p-6 lg:border-l lg:border-t-0">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-action" />
            <p className="text-xs font-semibold leading-5 text-fg-muted">
              {en
                ? "Finfold will re-read saved outcomes and prepare one trackable mission. Content generation and publishing still require your approval."
                : "Finfold 会重新读取已保存的真实结果，只准备一条可追踪任务；生成内容和发布仍需你的批准。"}
            </p>
          </div>
          <Button className="mt-5 w-full" variant="primary" onClick={() => void startFollowUp()} loading={starting}>
            {en ? "Confirm next mission" : "确认创建下一轮任务"}
            <ArrowRight className="h-4 w-4" />
          </Button>
          {error ? <p role="alert" className="mt-3 text-xs font-bold text-risk">{error}</p> : null}
        </div>
      </div>
    </Panel>
  );
}

function followUpDecisionCopy(verdict: GrowthMission["verdict"], locale: "zh" | "en") {
  const copy = {
    won: {
      zh: { title: "保留胜出方向，再验证下一个瓶颈", detail: "本轮达到预设目标。下一轮不会把所有内容推倒重来，而是保留有效部分，并根据最新数据只选择一个新的限制因素。" },
      en: { title: "Keep the winner and test the next bottleneck", detail: "This cycle reached its target. The next one keeps what worked and changes only one newly identified constraint." }
    },
    lost: {
      zh: { title: "停止放大这版，换一个变量验证", detail: "本轮结果低于基线，不应继续复制。下一轮会回到最上游的可证实断点，避免同时修改标题、正文和转化路径。" },
      en: { title: "Do not scale this version; test a different variable", detail: "This result fell below baseline. The next cycle returns to the earliest evidenced break instead of changing the hook, body, and conversion path together." }
    },
    inconclusive: {
      zh: { title: "不宣判胜负，先建立下一条对照样本", detail: "当前结果没有越过达标线，也没有明显低于基线。下一轮继续围绕同一个可测指标，补足可比较证据。" },
      en: { title: "Do not call a winner; build the next comparable sample", detail: "The result cleared neither the target nor the loss threshold. The next cycle stays on one measurable metric to add comparable evidence." }
    }
  } as const;
  return copy[verdict ?? "inconclusive"][locale];
}

function formatMetric(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
