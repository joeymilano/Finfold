"use client";

import { FormEvent, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock,
  ShieldCheck,
  Target
} from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import type {
  BusinessMissionReviewBottleneck,
  BusinessMissionReviewDecision,
  GrowthMission
} from "@/lib/agent/growth-missions";
import {
  businessMissionActualValue,
  businessMissionBottleneckLabel,
  formatBusinessMissionValue
} from "@/lib/business-mission-follow-up";
import {
  businessMissionBottlenecks,
  suggestedMeasurementWindowDays
} from "@/lib/business-mission-review";
import type { MissionOutcomeSummary } from "@/lib/mission-attribution";
import { captureEvent } from "@/lib/posthog";

type Props = {
  mission: GrowthMission;
  outcomeSummary: MissionOutcomeSummary;
  locale: "zh" | "en";
  onChanged: () => Promise<void>;
};

export function BusinessMissionMeasurementReview({
  mission,
  outcomeSummary,
  locale,
  onChanged
}: Props) {
  if (mission.missionKind !== "growth_opportunity" || mission.status !== "posted" || !mission.objectiveType) {
    return null;
  }
  if (mission.executionState === "review_due") {
    return <DueReview mission={mission} outcomeSummary={outcomeSummary} locale={locale} onChanged={onChanged} />;
  }
  return <MeasurementWindow mission={mission} outcomeSummary={outcomeSummary} locale={locale} onChanged={onChanged} />;
}

function MeasurementWindow({ mission, outcomeSummary, locale, onChanged }: Props) {
  const en = locale === "en";
  const [windowDays, setWindowDays] = useState(
    mission.measurementWindowDays ?? suggestedMeasurementWindowDays(mission.objectiveType)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const objectiveType = mission.objectiveType!;
  const actual = businessMissionActualValue(objectiveType, outcomeSummary);
  const actualLabel = formatBusinessMissionValue(actual, objectiveType, outcomeSummary.currency, locale);
  const targetLabel = formatBusinessMissionValue(mission.targetValue, objectiveType, outcomeSummary.currency, locale);

  async function saveWindow(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const idempotencyKey = idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = idempotencyKey;
    try {
      const response = await fetch(`/api/agent/missions/${mission.id}/measurement-window`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ windowDays, idempotencyKey })
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? (en ? "Unable to confirm the measurement window." : "暂时无法确认衡量周期。"));
      }
      captureEvent("business_mission_measurement_window_confirmed", {
        mission_id: mission.id,
        window_days: windowDays,
        changed: Boolean(mission.measurementDueAt)
      });
      idempotencyKeyRef.current = null;
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (en ? "Unable to confirm the measurement window." : "暂时无法确认衡量周期。"));
    } finally {
      setSaving(false);
    }
  }

  const form = (
    <form onSubmit={saveWindow} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label className="text-xs font-bold text-fg">
        {en ? "Measurement window" : "衡量周期"}
        <select
          value={windowDays}
          onChange={(event) => setWindowDays(Number(event.target.value))}
          className="field-input mt-2"
        >
          <option value={7}>{en ? "7 days" : "7 天"}</option>
          <option value={14}>{en ? "14 days" : "14 天"}</option>
          <option value={30}>{en ? "30 days" : "30 天"}</option>
          <option value={60}>{en ? "60 days" : "60 天"}</option>
          <option value={90}>{en ? "90 days" : "90 天"}</option>
        </select>
      </label>
      <Button type="submit" variant="primary" loading={saving}>
        {mission.measurementDueAt ? (en ? "Confirm new window" : "确认新周期") : (en ? "Confirm window" : "确认衡量周期")}
        <ArrowRight className="h-4 w-4" />
      </Button>
      {error ? <p role="alert" className="text-xs font-bold text-risk sm:col-span-2">{error}</p> : null}
    </form>
  );

  if (!mission.measurementDueAt) {
    return (
      <Panel className="border-action/35 bg-action/[0.045] p-5 md:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-action/12 text-action-strong dark:text-action">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <p className="eyebrow">{en ? "MEASUREMENT WINDOW" : "衡量周期确认"}</p>
            <h3 className="mt-2 text-xl font-black text-fg">{en ? "When should this mission be reviewed?" : "这条商业任务什么时候复盘？"}</h3>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-fg-muted">
              {en
                ? "Choose a clear window after confirmed distribution. Finfold will remind you at the deadline, but it will never turn missing data into a failed result."
                : "从确认发布后选择一个明确周期。Finfold 会在到期时提醒复盘，但不会把没有数据自动判成失败。"}
            </p>
          </div>
        </div>
        {form}
      </Panel>
    );
  }

  return (
    <Panel className="border-action/25 p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-action/10 text-action-strong dark:text-action">
            <Clock className="h-5 w-5" />
          </span>
          <div>
            <p className="eyebrow">{en ? "MEASURING" : "正在衡量"}</p>
            <h3 className="mt-2 text-xl font-black text-fg">
              {en ? `Review on ${formatReviewDate(mission.measurementDueAt, locale)}` : `${formatReviewDate(mission.measurementDueAt, locale)} 到期复盘`}
            </h3>
            <p className="mt-2 text-sm font-medium leading-6 text-fg-muted">
              {en
                ? `Recorded so far: ${actualLabel}; target: ${targetLabel}. Results remain evidence until you make the due-review decision.`
                : `当前已记录${actualLabel}，目标为${targetLabel}。这些数字在到期前只是证据，最终结论仍由你在复盘时确认。`}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-positive/25 bg-positive/8 px-3 py-2 text-xs font-semibold leading-5 text-fg-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
          <span>{en ? "No automatic win or failure" : "不会自动判定胜负"}</span>
        </div>
      </div>
      <details className="group mt-4 rounded-xl border border-hairline bg-surface-2/45 p-3">
        <summary className="focus-ring cursor-pointer list-none text-xs font-black text-fg [&::-webkit-details-marker]:hidden">
          {en ? "Adjust the confirmed window" : "调整已确认周期"}
        </summary>
        {form}
      </details>
    </Panel>
  );
}

function DueReview({ mission, outcomeSummary, locale, onChanged }: Props) {
  const router = useRouter();
  const en = locale === "en";
  const objectiveType = mission.objectiveType!;
  const actual = businessMissionActualValue(objectiveType, outcomeSummary);
  const targetReached = actual >= mission.targetValue;
  const actualLabel = formatBusinessMissionValue(actual, objectiveType, outcomeSummary.currency, locale);
  const targetLabel = formatBusinessMissionValue(mission.targetValue, objectiveType, outcomeSummary.currency, locale);
  const [decision, setDecision] = useState<BusinessMissionReviewDecision | "">(targetReached ? "goal_achieved" : "");
  const bottlenecks = businessMissionBottlenecks(objectiveType);
  const [bottleneck, setBottleneck] = useState<BusinessMissionReviewBottleneck>(bottlenecks[0]);
  const [evidenceNote, setEvidenceNote] = useState("");
  const [extensionDays, setExtensionDays] = useState(7);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    if (!decision) {
      setError(en ? "Choose one review decision." : "请选择一个复盘结论。");
      return;
    }
    setSaving(true);
    setError(null);
    const idempotencyKey = idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = idempotencyKey;
    try {
      const response = await fetch(`/api/agent/missions/${mission.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          decision,
          bottleneck: decision === "fix_bottleneck" ? bottleneck : null,
          evidenceNote,
          extensionDays: decision === "collect_more_evidence" ? extensionDays : null,
          idempotencyKey
        })
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        followUpError?: string | null;
        nextMission?: GrowthMission | null;
      };
      if (!response.ok) {
        throw new Error(data.error ?? (en ? "Unable to save the review." : "暂时无法保存复盘。"));
      }
      captureEvent("business_mission_review_confirmed", {
        mission_id: mission.id,
        decision,
        bottleneck: decision === "fix_bottleneck" ? bottleneck : null,
        extension_days: decision === "collect_more_evidence" ? extensionDays : null,
        next_mission_id: data.nextMission?.id ?? null
      });
      idempotencyKeyRef.current = null;
      if (data.nextMission) {
        router.push(`/operations/missions/${data.nextMission.id}`);
        router.refresh();
        return;
      }
      await onChanged();
      if (data.followUpError) setError(data.followUpError);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (en ? "Unable to save the review." : "暂时无法保存复盘。"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel className="overflow-hidden border-warning/40 bg-warning/[0.04]">
      <form onSubmit={submitReview}>
        <div className="p-5 md:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/12 text-warning">
              <CircleAlert className="h-5 w-5" />
            </span>
            <div>
              <p className="eyebrow">{en ? "DUE REVIEW" : "到期复盘"}</p>
              <h3 className="mt-2 text-xl font-black text-fg">{en ? "Confirm what the evidence supports" : "确认真实证据支持哪种结论"}</h3>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-fg-muted">
                {en
                  ? `Recorded result: ${actualLabel}; target: ${targetLabel}. Finfold will not infer causality or call missing data a failure.`
                  : `已记录结果为${actualLabel}，目标为${targetLabel}。Finfold 不会擅自推断因果，也不会把缺少数据判成失败。`}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <DecisionOption
              selected={decision === "goal_achieved"}
              disabled={!targetReached}
              onClick={() => setDecision("goal_achieved")}
              icon={<CheckCircle2 className="h-4 w-4" />}
              title={en ? "Target achieved" : "目标已达成"}
              detail={targetReached
                ? (en ? "Confirm the recorded result and create one replication mission." : "确认已记录结果，并创建一条结果复现任务。")
                : (en ? "Available only after recorded results reach the target." : "只有已记录结果达到目标后才能选择。")}
            />
            <DecisionOption
              selected={decision === "fix_bottleneck"}
              disabled={targetReached}
              onClick={() => setDecision("fix_bottleneck")}
              icon={<Target className="h-4 w-4" />}
              title={en ? "Target missed: repair one break" : "目标未达成：修复一个断点"}
              detail={en ? "Choose one evidence-backed breakpoint; keep every other condition stable." : "基于证据只选一个断点，其余经营条件保持不变。"}
            />
            <DecisionOption
              selected={decision === "collect_more_evidence"}
              onClick={() => setDecision("collect_more_evidence")}
              icon={<Clock className="h-4 w-4" />}
              title={en ? "Evidence insufficient" : "证据不足：继续取证"}
              detail={en ? "Set a new explicit window without declaring a win or failure." : "设置新的明确周期，不宣判达标或失败。"}
            />
          </div>

          {decision === "fix_bottleneck" ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-fg">
                {en ? "One breakpoint to repair" : "唯一修复断点"}
                <select value={bottleneck} onChange={(event) => setBottleneck(event.target.value as BusinessMissionReviewBottleneck)} className="field-input mt-2">
                  {bottlenecks.map((item) => <option key={item} value={item}>{businessMissionBottleneckLabel(item, locale)}</option>)}
                </select>
              </label>
              <EvidenceNote value={evidenceNote} onChange={setEvidenceNote} locale={locale} prompt={en ? "Evidence for this choice" : "选择这个断点的证据"} />
            </div>
          ) : null}

          {decision === "collect_more_evidence" ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-fg">
                {en ? "New collection window" : "新的取证周期"}
                <select value={extensionDays} onChange={(event) => setExtensionDays(Number(event.target.value))} className="field-input mt-2">
                  <option value={7}>{en ? "7 days" : "7 天"}</option>
                  <option value={14}>{en ? "14 days" : "14 天"}</option>
                  <option value={30}>{en ? "30 days" : "30 天"}</option>
                  <option value={60}>{en ? "60 days" : "60 天"}</option>
                  <option value={90}>{en ? "90 days" : "90 天"}</option>
                </select>
              </label>
              <EvidenceNote value={evidenceNote} onChange={setEvidenceNote} locale={locale} prompt={en ? "Which evidence is still missing?" : "还缺少哪项证据？"} />
            </div>
          ) : null}

          {error ? <p role="alert" className="mt-4 text-xs font-bold text-risk">{error}</p> : null}
        </div>

        <div className="flex flex-col gap-3 border-t border-hairline bg-surface/55 p-5 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div className="flex items-start gap-2 text-xs font-semibold leading-5 text-fg-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-action" />
            <span>{en ? "This click records your decision. Publishing and future consequential actions still require approval." : "本次点击会记录你的复盘决定；后续发布和关键动作仍需单独批准。"}</span>
          </div>
          <Button type="submit" variant="primary" loading={saving} disabled={!decision}>
            {reviewButtonLabel(decision, locale)}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function DecisionOption({ selected, disabled = false, onClick, icon, title, detail }: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`focus-ring rounded-xl border p-4 text-left transition ${selected ? "border-action/55 bg-action/[0.09]" : "border-hairline bg-surface/70 hover:border-action/30"} disabled:cursor-not-allowed disabled:opacity-45`}
    >
      <span className="flex items-center gap-2 text-sm font-black text-fg">{icon}{title}</span>
      <span className="mt-2 block text-xs font-medium leading-5 text-fg-muted">{detail}</span>
    </button>
  );
}

function EvidenceNote({ value, onChange, locale, prompt }: { value: string; onChange: (value: string) => void; locale: "zh" | "en"; prompt: string }) {
  return (
    <label className="text-xs font-bold text-fg">
      {prompt}
      <textarea
        required
        minLength={10}
        maxLength={500}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field-input mt-2 min-h-24 resize-y"
        placeholder={locale === "en" ? "State where you verified it. Do not include names, email addresses, or phone numbers." : "说明你在哪里核对过；不要填写姓名、邮箱或手机号。"}
      />
    </label>
  );
}

function reviewButtonLabel(decision: BusinessMissionReviewDecision | "", locale: "zh" | "en"): string {
  if (locale === "en") {
    if (decision === "goal_achieved") return "Confirm and create replication";
    if (decision === "fix_bottleneck") return "Confirm and create repair";
    if (decision === "collect_more_evidence") return "Continue evidence collection";
    return "Choose a review decision";
  }
  if (decision === "goal_achieved") return "确认达标并创建复现任务";
  if (decision === "fix_bottleneck") return "确认未达标并创建修复任务";
  if (decision === "collect_more_evidence") return "继续取证";
  return "请选择复盘结论";
}

function formatReviewDate(iso: string, locale: "zh" | "en"): string {
  return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}
