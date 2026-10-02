"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Repeat2, ShieldCheck, Target } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import type { GrowthMission } from "@/lib/agent/growth-missions";
import {
  buildBusinessMissionFollowUp,
  buildBusinessMissionRepairFollowUp,
  formatBusinessMissionValue
} from "@/lib/business-mission-follow-up";
import type { MissionOutcomeSummary } from "@/lib/mission-attribution";
import { captureEvent } from "@/lib/posthog";

type BusinessOutcomeFollowUpDecisionProps = {
  mission: GrowthMission;
  outcomeSummary: MissionOutcomeSummary;
  locale: "zh" | "en";
};

export function BusinessOutcomeFollowUpDecision({
  mission,
  outcomeSummary,
  locale
}: BusinessOutcomeFollowUpDecisionProps) {
  const router = useRouter();
  const en = locale === "en";
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRepair = mission.verdict === "lost";
  let preview: ReturnType<typeof buildBusinessMissionFollowUp> | ReturnType<typeof buildBusinessMissionRepairFollowUp>;
  try {
    preview = isRepair
      ? buildBusinessMissionRepairFollowUp(mission, outcomeSummary, locale)
      : buildBusinessMissionFollowUp(mission, outcomeSummary, locale);
  } catch {
    return null;
  }

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
        throw new Error(data.error ?? (en ? "Unable to create the replication mission." : "暂时无法创建结果复现任务。"));
      }
      captureEvent(isRepair ? "business_result_repair_confirmed" : "business_result_replication_confirmed", {
        sourceMissionId: mission.id,
        missionId: data.mission.id,
        objectiveType: mission.objectiveType,
        previousActualValue: preview.actualValue,
        nextTargetValue: preview.nextTargetValue,
        existing: Boolean(data.existing)
      });
      router.push(`/operations/missions/${data.mission.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (en ? "Unable to create the replication mission." : "暂时无法创建结果复现任务。"));
      setStarting(false);
    }
  }

  const actual = formatBusinessMissionValue(preview.actualValue, preview.objectiveType, preview.currency, locale);
  const nextTarget = formatBusinessMissionValue(preview.nextTargetValue, preview.objectiveType, preview.currency, locale);

  return (
    <Panel className={`overflow-hidden ${isRepair ? "border-action/35 bg-action/[0.045]" : "border-positive/35 bg-positive/[0.045]"}`}>
      <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <div className="p-5 md:p-6">
          <div className="flex items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isRepair ? "bg-action/12 text-action-strong dark:text-action" : "bg-positive/12 text-positive"}`}>
              {isRepair ? <Target className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            </span>
            <div>
              <p className="eyebrow">{isRepair ? (en ? "REVIEWED BREAKPOINT" : "已确认修复断点") : (en ? "VERIFIED BUSINESS RESULT" : "已确认业务结果")}</p>
              <h3 className="mt-2 text-xl font-black text-fg">{preview.title}</h3>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-fg-muted">
                {isRepair
                  ? (en
                      ? "The target was missed. Change only the breakpoint you selected from the saved evidence; this is a test, not a causal claim."
                      : "本轮未达标。下一轮只修改你基于已保存证据选定的断点；这是待验证假设，不是因果结论。")
                  : (en
                      ? "One successful cycle is useful evidence, but not yet proof of repeatability. Keep the operating conditions stable and reproduce it once before scaling."
                      : "一次达标是有价值的证据，但还不能证明可以稳定复制。先保持经营条件不变，再复现一轮，然后才决定是否扩大。")}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
            <div className={`rounded-xl border ${isRepair ? "border-action/25" : "border-positive/25"} bg-surface/75 p-3`}>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-fg-muted">{en ? "Recorded result" : "上一轮真实结果"}</p>
              <p className="mt-1 text-sm font-black text-fg">{actual}</p>
            </div>
            <Repeat2 className={`mx-auto hidden h-4 w-4 sm:block ${isRepair ? "text-action" : "text-positive"}`} />
            <div className={`rounded-xl border ${isRepair ? "border-action/25 bg-action/[0.07]" : "border-positive/25 bg-positive/[0.07]"} p-3`}>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-fg-muted">{isRepair ? (en ? "Repair-cycle target" : "修复轮次目标") : (en ? "Replication target" : "下一轮复现目标")}</p>
              <p className="mt-1 text-sm font-black text-fg">{isRepair ? (en ? `Repair one break and reach ${nextTarget}` : `只修一个断点，目标仍为${nextTarget}`) : (en ? `Reach ${nextTarget} again` : `再次达到${nextTarget}`)}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-hairline bg-surface/45 p-5 md:p-6 lg:border-l lg:border-t-0">
          <div className="flex items-start gap-2">
            <ShieldCheck className={`mt-0.5 h-4 w-4 shrink-0 ${isRepair ? "text-action" : "text-positive"}`} />
            <p className="text-xs font-semibold leading-5 text-fg-muted">
              {en
                ? "Finfold keeps the same platform, offer, audience, conversion path, target, and source evidence. It will not increase spend, generate content, or publish without your approval."
                : "Finfold 会沿用相同平台、产品、受众、转化路径、目标和来源证据；不会自动增加预算，生成内容与发布仍需你的批准。"}
            </p>
          </div>
          <Button className="mt-5 w-full" variant="primary" onClick={() => void startFollowUp()} loading={starting}>
            {isRepair ? (en ? "Confirm repair mission" : "确认创建单断点修复任务") : (en ? "Confirm replication mission" : "确认创建结果复现任务")}
            <ArrowRight className="h-4 w-4" />
          </Button>
          {error ? <p role="alert" className="mt-3 text-xs font-bold text-risk">{error}</p> : null}
        </div>
      </div>
    </Panel>
  );
}
