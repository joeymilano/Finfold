"use client";

import Link from "next/link";
import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  ShieldCheck,
  Target
} from "@/components/ui/icons";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { useLocale } from "@/hooks/useLocale";
import type { GrowthMission } from "@/lib/agent/growth-missions";
import type {
  MissionAction,
  MissionOutcomeSummary,
  MissionTimelineEvent,
  MissionTrackingLink
} from "@/lib/mission-attribution";
import type { MissionControlDetail } from "@/lib/mission-control";
import { getLocalizedPlatformLabel } from "@/lib/platforms";
import { captureEvent } from "@/lib/posthog";

type MissionListResponse = { missions?: GrowthMission[]; error?: string };

export function MissionControl({ initialMissionId }: { initialMissionId?: string }) {
  const locale = useLocale();
  const en = locale === "en";
  const [missions, setMissions] = useState<GrowthMission[]>([]);
  const [selectedId, setSelectedId] = useState(initialMissionId ?? "");
  const selectedIdRef = useRef(initialMissionId ?? "");
  const [detail, setDetail] = useState<MissionControlDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMission = useCallback(async (missionId: string) => {
    const response = await fetch(`/api/agent/missions/${missionId}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as MissionControlDetail & { error?: string };
    if (!response.ok || !data.mission) throw new Error(data.error ?? "Unable to load the mission.");
    setDetail(data);
    selectedIdRef.current = missionId;
    setSelectedId(missionId);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/missions?limit=25", { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as MissionListResponse;
      if (!response.ok) throw new Error(data.error ?? "Unable to load missions.");
      const nextMissions = data.missions ?? [];
      setMissions(nextMissions);
      const preferred = initialMissionId && nextMissions.some((mission) => mission.id === initialMissionId)
        ? initialMissionId
        : selectedIdRef.current && nextMissions.some((mission) => mission.id === selectedIdRef.current)
          ? selectedIdRef.current
          : nextMissions.find((mission) => ["accepted", "draft_ready", "posted"].includes(mission.status))?.id ?? nextMissions[0]?.id;
      if (preferred) await loadMission(preferred);
      else setDetail(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load missions.");
    } finally {
      setLoading(false);
    }
  }, [initialMissionId, loadMission]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading) return <Panel className="min-h-[520px] animate-pulse bg-surface-2/45"><span className="sr-only">Loading</span></Panel>;
  if (error) return <Panel className="border-risk/30 p-6 text-sm font-semibold text-risk">{error}</Panel>;
  if (missions.length === 0) return <MissionEmptyState locale={locale} />;

  return (
    <div className="grid gap-5 pb-10">
      <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{en ? "GROWTH MISSION" : "增长任务"}</p>
          <h1 className="mt-2 text-2xl font-black text-fg md:text-3xl">
            {en ? "Finfold moves the work forward" : "Finfold 推进，你做关键决策"}
          </h1>
        </div>
        <Link href="/dashboard" className={buttonStyles({ variant: "secondary" })}>
          {en ? "Back to Agent" : "返回 Agent"}<ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="hidden xl:block">
          <MissionList missions={missions} selectedId={selectedId} locale={locale} onSelect={(id) => void loadMission(id)} />
        </div>
        {detail ? <MissionDetail detail={detail} locale={locale} onChanged={refresh} /> : null}
      </div>
    </div>
  );
}

function MissionList({ missions, selectedId, locale, onSelect }: {
  missions: GrowthMission[];
  selectedId: string;
  locale: "zh" | "en";
  onSelect: (id: string) => void;
}) {
  return (
    <Panel className="p-3">
      <p className="px-2 pb-2 text-[10px] font-black uppercase tracking-[0.16em] text-fg-muted">
        {locale === "en" ? "Missions" : "增长任务"}
      </p>
      <div className="grid gap-2">
        {missions.map((mission) => {
          const selected = mission.id === selectedId;
          return (
            <button key={mission.id} type="button" onClick={() => onSelect(mission.id)} className={`focus-ring rounded-xl border p-3 text-left transition ${selected ? "border-action/55 bg-action/[0.08]" : "border-hairline bg-surface-2/45 hover:border-action/30"}`}>
              <div className="flex items-center justify-between gap-2">
                <Tag tone={statusTone(mission.status)} dot>{missionStatus(mission.status, locale)}</Tag>
                <span className="text-[10px] font-bold text-fg-subtle">{formatShortDate(mission.updatedAt, locale)}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-black leading-5 text-fg">{mission.title}</p>
              <p className="mt-1 text-[11px] font-semibold text-fg-muted">{getLocalizedPlatformLabel(mission.platform, locale, true)}</p>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function MissionDetail({ detail, locale, onChanged }: { detail: MissionControlDetail; locale: "zh" | "en"; onChanged: () => Promise<void> }) {
  const en = locale === "en";
  const mission = detail.mission;
  const progress = missionProgress(mission);
  const pendingAction = detail.actions.find((action) => action.status === "awaiting_approval");
  return (
    <div className="grid gap-5">
      <Panel className="p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={statusTone(mission.status)} dot>{missionStatus(mission.status, locale)}</Tag>
              <Tag tone="neutral">{getLocalizedPlatformLabel(mission.platform, locale)}</Tag>
              {mission.trackingEnabled ? <Tag tone="success">{en ? "Tracking on" : "追踪已开启"}</Tag> : null}
            </div>
            <h2 className="mt-3 text-balance text-2xl font-black leading-tight text-fg md:text-3xl">{mission.title}</h2>
            <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-fg-muted">{mission.hypothesis}</p>
          </div>
          <div className="min-w-[220px] rounded-xl border border-hairline bg-surface-2/60 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-fg-muted">{en ? "Success metric" : "唯一成功指标"}</p>
            <p className="mt-2 text-sm font-black text-fg">{mission.primaryMetric}</p>
            <div className="mt-2 flex items-end gap-2"><span className="text-3xl font-black tabular text-action-strong dark:text-action">{metricActual(mission, detail.outcomeSummary).toLocaleString()}</span><span className="pb-1 text-xs font-bold text-fg-muted">/ {mission.targetValue.toLocaleString()}</span></div>
          </div>
        </div>
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs font-bold text-fg-muted"><span>{executionState(mission.executionState, locale)}</span><span>{progress}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-action transition-all" style={{ width: `${progress}%` }} /></div>
        </div>
      </Panel>

      {pendingAction ? <DecisionInbox action={pendingAction} missionId={mission.id} locale={locale} onChanged={onChanged} /> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <TrackingPanel missionId={mission.id} link={detail.trackingLink} clicks={detail.outcomeSummary.clicks} defaultUrl={trackingDefaultUrl(mission)} locale={locale} onChanged={onChanged} />
        <OutcomeForm missionId={mission.id} objectiveType={mission.objectiveType} defaultCurrency={detail.outcomeSummary.currency} locale={locale} onChanged={onChanged} />
      </div>

      <details className="group rounded-2xl border border-hairline bg-surface">
        <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 text-sm font-black text-fg [&::-webkit-details-marker]:hidden">
          <span>{en ? "Work log and mission assets" : "工作记录与任务资产"}</span>
          <span className="text-xs font-bold text-fg-muted group-open:hidden">{en ? "View details" : "查看详情"}</span>
          <span className="hidden text-xs font-bold text-fg-muted group-open:inline">{en ? "Hide" : "收起"}</span>
        </summary>
        <div className="grid gap-5 border-t border-hairline p-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <Timeline events={detail.events} locale={locale} />
          <Panel className="p-5 md:p-6">
            <p className="eyebrow">{en ? "MISSION ASSETS" : "任务资产"}</p>
            <h3 className="mt-2 text-xl font-black text-fg">{en ? "Prepared work" : "已准备的执行内容"}</h3>
            <p className="mt-2 text-sm leading-6 text-fg-muted">{en ? "Open the workspace only when you need to inspect or edit the prepared assets." : "需要检查或编辑执行内容时，再进入工作台。"}</p>
            <Link href={detail.workbenchHref} className={`${buttonStyles({ variant: "primary" })} mt-5 w-full`}>
              {mission.kitId ? (en ? "Open mission assets" : "打开任务资产") : (en ? "Open execution Studio" : "打开执行工作台")}<ArrowRight className="h-4 w-4" />
            </Link>
          </Panel>
        </div>
      </details>
    </div>
  );
}

function DecisionInbox({ action, missionId, locale, onChanged }: { action: MissionAction; missionId: string; locale: "zh" | "en"; onChanged: () => Promise<void> }) {
  const en = locale === "en";
  const [busy, setBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const title = action.kind === "review_and_publish"
    ? (en ? "Review the finished draft before distribution" : "发布前确认已完成的草稿")
    : (en ? "Approve the mission brief and open execution Studio" : "批准任务简报并进入执行 Studio");
  async function decide(decision: "approve" | "cancel") {
    setBusy(true);
    setDecisionError(null);
    try {
      const response = await fetch(`/api/agent/missions/${missionId}/actions/${action.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      const data = await response.json().catch(() => ({})) as { error?: string; workbenchHref?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to apply the decision.");
      captureEvent(decision === "approve" ? "mission_action_approved" : "mission_action_cancelled", { mission_id: missionId, action_kind: action.kind });
      if (decision === "approve" && data.workbenchHref) window.location.assign(data.workbenchHref);
      else await onChanged();
    } catch (caught) {
      setDecisionError(caught instanceof Error ? caught.message : (en ? "Unable to apply this decision." : "暂时无法执行这个决策。"));
    } finally { setBusy(false); }
  }
  return (
    <Panel className="border-action/35 bg-action/[0.045] p-5 md:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-action/12 text-action-strong dark:text-action"><ShieldCheck className="h-5 w-5" /></span><div><p className="eyebrow">{en ? "DECISION INBOX" : "决策收件箱"}</p><h3 className="mt-2 text-lg font-black text-fg">{title}</h3><p className="mt-1 text-xs font-semibold text-fg-muted">{en ? "Finfold pauses here because this action changes what customers will see." : "这一步会影响客户看到的内容，因此 Finfold 在此暂停等待确认。"}</p></div></div>
        <div className="flex shrink-0 gap-2"><Button variant="tertiary" onClick={() => void decide("cancel")} disabled={busy}>{en ? "Close mission" : "关闭任务"}</Button><Button variant="primary" onClick={() => void decide("approve")} loading={busy}>{en ? "Approve next step" : "批准下一步"}<ArrowRight className="h-4 w-4" /></Button></div>
      </div>
      {decisionError ? <p role="alert" className="mt-3 text-xs font-bold text-risk">{decisionError}</p> : null}
    </Panel>
  );
}

function TrackingPanel({ missionId, link, clicks, defaultUrl, locale, onChanged }: { missionId: string; link: MissionTrackingLink | null; clicks: number; defaultUrl: string; locale: "zh" | "en"; onChanged: () => Promise<void> }) {
  const en = locale === "en";
  const [url, setUrl] = useState(link?.destinationUrl ?? defaultUrl);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  useEffect(() => setUrl(link?.destinationUrl ?? defaultUrl), [defaultUrl, link?.destinationUrl]);
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setTrackingError(null);
    try { const response = await fetch(`/api/agent/missions/${missionId}/tracking-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinationUrl: url }) }); const data = await response.json().catch(() => ({})) as { error?: string }; if (!response.ok) throw new Error(data.error ?? "Unable to enable tracking."); captureEvent("tracking_enabled", { mission_id: missionId }); await onChanged(); } catch (caught) { setTrackingError(caught instanceof Error ? caught.message : (en ? "Unable to enable tracking." : "暂时无法开启追踪。")); } finally { setSaving(false); }
  }
  async function copy() { if (!link) return; await navigator.clipboard.writeText(link.trackingUrl); setCopied(true); setTimeout(() => setCopied(false), 1400); }
  return <Panel className="p-5 md:p-6"><p className="eyebrow">{en ? "TRACKING LINK" : "任务追踪链接"}</p><h3 className="mt-2 text-xl font-black text-fg">{link ? (en ? `${clicks} tracked clicks` : `已追踪 ${clicks} 次点击`) : (en ? "Measure traffic from this mission" : "衡量这次任务带来的流量")}</h3><p className="mt-2 text-xs font-semibold leading-5 text-fg-muted">{en ? "This link records clicks only. Business results are confirmed separately." : "追踪链接只统计通过该链接的点击；业务结果需另行确认。"}</p>{link ? <div className="mt-4 rounded-xl border border-positive/25 bg-positive/8 p-3"><p className="break-all text-xs font-bold text-fg">{link.trackingUrl}</p><div className="mt-3 flex gap-2"><Button size="sm" variant="secondary" onClick={() => void copy()}>{copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? (en ? "Copied" : "已复制") : (en ? "Copy" : "复制")}</Button><a href={`${link.trackingUrl}?preview=1`} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "tertiary", size: "sm" })}>{en ? "Test without counting" : "测试（不计数）"}<ExternalLink className="h-3.5 w-3.5" /></a></div></div> : null}<form onSubmit={save} className="mt-4"><label className="text-xs font-bold text-fg">{en ? "Destination page" : "跳转目标页面"}<input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} className="field-input mt-2" placeholder="https://your-product.com/signup" /></label>{trackingError ? <p role="alert" className="mt-2 text-xs font-bold text-risk">{trackingError}</p> : null}<Button type="submit" variant={link ? "tertiary" : "primary"} fullWidth className="mt-3" loading={saving}><Link2 className="h-4 w-4" />{link ? (en ? "Update destination" : "更新目标页面") : (en ? "Enable tracking" : "开启任务追踪")}</Button></form></Panel>;
}

function OutcomeForm({ missionId, objectiveType, defaultCurrency, locale, onChanged }: { missionId: string; objectiveType: GrowthMission["objectiveType"]; defaultCurrency: string; locale: "zh" | "en"; onChanged: () => Promise<void> }) {
  const en = locale === "en";
  const eventType = objectiveType === "signups" ? "signup" : objectiveType === "purchases" ? "revenue" : "lead";
  const resultLabel = eventType === "signup" ? (en ? "signups" : "注册") : eventType === "revenue" ? (en ? "revenue" : "收入") : (en ? "qualified leads" : "有效线索");
  const [count, setCount] = useState(1);
  const [value, setValue] = useState(0);
  const [currency, setCurrency] = useState(defaultCurrency || "CNY");
  const [saving, setSaving] = useState(false);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setOutcomeError(null);
    const idempotencyKey = idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = idempotencyKey;
    try {
      const response = await fetch(`/api/agent/missions/${missionId}/outcomes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventType, count: eventType === "revenue" ? 1 : count, value, currency, note: "", idempotencyKey }) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to record outcome.");
      captureEvent("mission_outcome_recorded", { mission_id: missionId, event_type: eventType, count, value, currency });
      idempotencyKeyRef.current = null;
      await onChanged();
    } catch (caught) {
      setOutcomeError(caught instanceof Error ? caught.message : (en ? "Unable to record this outcome." : "暂时无法记录这个结果。"));
    } finally { setSaving(false); }
  }
  return <Panel className="p-5 md:p-6"><p className="eyebrow">{en ? "BUSINESS RESULT" : "业务结果"}</p><h3 className="mt-2 text-xl font-black text-fg">{en ? `Confirm ${resultLabel}` : `确认${resultLabel}`}</h3><p className="mt-2 text-xs font-semibold leading-5 text-fg-muted">{en ? "Enter the result you verified. Finfold stores it as a manual result and will not infer it from clicks." : "填写你已确认的结果。Finfold 会标记为手动结果，不会从点击中推断。"}</p><form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">{eventType === "revenue" ? <><label className="text-xs font-bold text-fg">{en ? "Amount" : "金额"}<input type="number" min="0.01" step="0.01" required value={value} onChange={(event) => setValue(Number(event.target.value))} className="field-input mt-2" /></label><label className="text-xs font-bold text-fg">{en ? "Currency" : "币种"}<select value={currency} onChange={(event) => setCurrency(event.target.value)} className="field-input mt-2"><option>CNY</option><option>USD</option><option>HKD</option><option>GBP</option><option>EUR</option></select></label></> : <label className="text-xs font-bold text-fg sm:col-span-2">{en ? `Number of ${resultLabel}` : `${resultLabel}数量`}<input type="number" min="1" max="10000" required value={count} onChange={(event) => setCount(Number(event.target.value))} className="field-input mt-2" /></label>}{outcomeError ? <p role="alert" className="text-xs font-bold text-risk sm:col-span-2">{outcomeError}</p> : null}<Button type="submit" variant="primary" fullWidth className="sm:col-span-2" loading={saving}>{en ? "Record result" : "记录结果"}<ArrowRight className="h-4 w-4" /></Button></form></Panel>;
}

function Timeline({ events, locale }: { events: MissionTimelineEvent[]; locale: "zh" | "en" }) { const en = locale === "en"; return <Panel className="p-5 md:p-6"><p className="eyebrow">{en ? "WORKDAY PLAYBACK" : "工作日回放"}</p><h3 className="mt-2 text-xl font-black text-fg">{en ? "What Finfold actually did" : "Finfold 实际完成了什么"}</h3><div className="mt-5 grid gap-4">{events.length ? events.map((event) => <div key={event.id} className="grid grid-cols-[54px_12px_minmax(0,1fr)] gap-3"><time className="pt-0.5 text-[11px] font-bold tabular text-fg-muted">{formatTime(event.occurredAt, locale)}</time><span className="relative mt-1.5 h-2.5 w-2.5 rounded-full bg-action after:absolute after:left-[4px] after:top-3 after:h-[calc(100%+16px)] after:w-px after:bg-hairline last:after:hidden" /><div><p className="text-sm font-black text-fg">{timelineLabel(event.eventType, locale)}</p><p className="mt-1 text-xs leading-5 text-fg-muted">{timelineDetail(event, locale)}</p></div></div>) : <p className="text-sm text-fg-muted">{en ? "No mission events yet." : "还没有任务事件。"}</p>}</div></Panel>; }

function MissionEmptyState({ locale }: { locale: "zh" | "en" }) { const en = locale === "en"; return <Panel className="p-8 text-center"><Target className="mx-auto h-9 w-9 text-action" /><h1 className="mt-4 text-2xl font-black text-fg">{en ? "No Growth Mission yet" : "还没有增长任务"}</h1><p className="mx-auto mt-2 max-w-xl text-sm text-fg-muted">{en ? "Start with a website audit. Finfold will rank three evidence-based opportunities." : "先从网站审计开始，Finfold 会排序三个有证据的增长机会。"}</p><Link href="/dashboard" className={`${buttonStyles({ variant: "primary" })} mt-5`}>{en ? "Find opportunities" : "发现增长机会"}<ArrowRight className="h-4 w-4" /></Link></Panel>; }

function missionProgress(mission: GrowthMission) { return ({ planned: 15, generating: 38, awaiting_decision: 58, running: 72, measuring: 86, completed: 100, closed: 100 } as const)[mission.executionState]; }
function metricActual(mission: GrowthMission, summary: MissionOutcomeSummary) { if (mission.primaryMetricKey === "leads") return summary.leads; if (mission.primaryMetricKey === "signups") return summary.signups; if (mission.primaryMetricKey === "revenue") return summary.revenue; return mission.outcome?.actualValue ?? 0; }
function trackingDefaultUrl(mission: GrowthMission) { const source = mission.workbenchIdea.match(/https?:\/\/[^\s)]+/i)?.[0]; return source ? source.replace(/[，。,.]+$/, "") : ""; }
function missionStatus(status: GrowthMission["status"], locale: "zh" | "en") { const map = locale === "en" ? { accepted: "Planned", draft_ready: "Decision needed", posted: "Measuring", completed: "Completed", dismissed: "Closed", superseded: "Superseded" } : { accepted: "已规划", draft_ready: "等待决策", posted: "正在衡量", completed: "已完成", dismissed: "已关闭", superseded: "已替换" }; return map[status]; }
function statusTone(status: GrowthMission["status"]): "neutral" | "action" | "warn" | "success" { if (status === "completed") return "success"; if (status === "draft_ready") return "warn"; if (status === "accepted" || status === "posted") return "action"; return "neutral"; }
function executionState(state: GrowthMission["executionState"], locale: "zh" | "en") { const map = locale === "en" ? { planned: "Mission planned", generating: "Preparing assets", awaiting_decision: "Waiting for your decision", running: "Distribution running", measuring: "Measuring business outcomes", completed: "Mission completed", closed: "Mission closed" } : { planned: "任务已规划", generating: "正在准备资产", awaiting_decision: "等待你的决策", running: "正在分发", measuring: "正在衡量业务结果", completed: "任务已完成", closed: "任务已关闭" }; return map[state]; }
function formatShortDate(iso: string, locale: "zh" | "en") { return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "zh-CN", { month: "short", day: "numeric" }); }
function formatTime(iso: string, locale: "zh" | "en") { return new Date(iso).toLocaleTimeString(locale === "en" ? "en-US" : "zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }); }
function timelineLabel(type: string, locale: "zh" | "en") { const labels: Record<string, { zh: string; en: string }> = { mission_created: { zh: "创建增长任务", en: "Growth Mission created" }, action_approved: { zh: "关键动作已批准", en: "Action approved" }, action_cancelled: { zh: "动作已跳过", en: "Action skipped" }, draft_ready: { zh: "执行草稿已完成", en: "Execution draft completed" }, tracking_enabled: { zh: "追踪链接已开启", en: "Tracking enabled" }, tracking_link_updated: { zh: "追踪目标已更新", en: "Tracking destination updated" }, tracking_click: { zh: "获得一次可归因点击", en: "Attributed click recorded" }, distribution_confirmed: { zh: "用户确认已发布", en: "Distribution confirmed" }, outcome_recorded: { zh: "业务结果已回传", en: "Business outcome recorded" }, mission_completed: { zh: "任务达到目标", en: "Mission reached its target" } }; return labels[type]?.[locale] ?? type.replaceAll("_", " "); }
function timelineDetail(event: MissionTimelineEvent, locale: "zh" | "en") { const payload = event.payload; if (event.eventType === "outcome_recorded") return locale === "en" ? `${payload.count ?? 1} ${payload.eventType ?? "outcome"} recorded from ${payload.source ?? "manual"}.` : `记录 ${payload.count ?? 1} 个${String(payload.eventType ?? "结果")}，来源：${payload.source ?? "手动"}。`; if (event.eventType === "tracking_click") return locale === "en" ? `Source: ${payload.source ?? "unknown"}; campaign: ${payload.campaign ?? "mission"}.` : `来源：${payload.source ?? "未知"}；活动：${payload.campaign ?? "任务"}。`; return locale === "en" ? "Stored in the mission ledger." : "已写入任务事件账本。"; }
