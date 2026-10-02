"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  FlaskConical,
  History,
  Lightbulb,
  Link2,
  Send,
  Target
} from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { growthLoopDisabledCopy } from "@/components/growth-loop/copy";
import { useLocale } from "@/hooks/useLocale";

type VariantPlan = { key: string; angle: string; workbenchIdea: string; kitId?: string };

type MissionActionView = {
  id: string;
  kind: string;
  status: string;
  input: Record<string, unknown>;
  payloadHash: string | null;
  approvedPayloadHash: string | null;
  executionMode: string;
  evidenceUrl: string | null;
  evidenceLevel: string;
  updatedAt: string;
};

type MissionView = {
  id: string;
  title: string;
  hypothesis: string;
  status: string;
  executionState: string;
  planVersion: number | null;
  createdAt: string;
  actions: MissionActionView[];
  trackingLinks: Array<{ variantKey: string; trackingUrl: string }>;
  events: Array<{ id: number; eventType: string; payload: Record<string, unknown>; occurredAt: string }>;
  reviewHistory: Array<{
    reviewVersion: number;
    asOf: string;
    conclusion: string;
    narrative: string;
  }>;
};

type LearningView = {
  id: string;
  statement: string;
  applicable_conditions: string;
  limitations: string;
  status: string;
  mission_id: string | null;
  created_at: string;
};

type GoalView = {
  id: string;
  title: string;
  status: string;
  target_value: number | string;
  landing_url: string;
  end_at: string;
};

type GoalDetailData = { goal: GoalView; missions: MissionView[]; learnings: LearningView[] };

type ReviewSnapshotView = {
  asOf: string;
  attributionRuleVersion: string;
  variants: Array<{ key: string; distinctClickVisitors: number; attributedSignups: number; activations: number }>;
  totals: {
    distinctClickVisitors: number;
    attributedSignups: number;
    activations: number;
    sitewideSignupsInWindow: number | null;
    unattributedSignups: number | null;
  };
  ratios: { clickToSignup: number | null; signupToActivation: number | null; costPerActivationCredits: number | null };
  cost: { knownCredits: number; scopeNote: string };
  limitations: string[];
};

type KitOption = { id: string; ideaText: string; createdAt: string; growthMissionId: string | null };

export function GrowthGoalWorkspace({ goalId }: { goalId: string }) {
  const locale = useLocale();
  const en = locale === "en";
  const [detail, setDetail] = useState<GoalDetailData | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [kits, setKits] = useState<KitOption[]>([]);
  const [snapshot, setSnapshot] = useState<ReviewSnapshotView | null>(null);
  const [evidenceDraft, setEvidenceDraft] = useState<Record<string, { url: string; mode: "manual" | "assisted" }>>({});

  const activeMission = useMemo(
    () => detail?.missions?.find((mission) => ["accepted", "draft_ready", "posted"].includes(mission.status)) ?? null,
    [detail]
  );

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/growth-loop/goals/${goalId}`, { cache: "no-store" });
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (response.status === 404) {
        setError(en ? "Goal not found." : "目标不存在");
        return;
      }
      if (!response.ok) throw new Error((await response.json()).error ?? "failed");
      setDetail(await response.json());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "failed");
    }
  }, [goalId, en]);

  const loadKits = useCallback(async () => {
    try {
      const response = await fetch("/api/kits", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setKits(
        (data.kits ?? []).map((kit: { id: string; idea_text: string; created_at: string; growth_mission_id: string | null }) => ({
          id: kit.id,
          ideaText: kit.idea_text,
          createdAt: kit.created_at,
          growthMissionId: kit.growth_mission_id
        }))
      );
    } catch {
      /* kit picker is a convenience; binding still works via the API */
    }
  }, []);

  const loadSnapshot = useCallback(async (missionId: string) => {
    try {
      const response = await fetch(`/api/growth-loop/missions/${missionId}/review`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setSnapshot(data.snapshot ?? null);
    } catch {
      /* snapshot is read-only; failures show as missing data */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadKits();
  }, [load, loadKits]);

  useEffect(() => {
    if (activeMission?.status === "posted") void loadSnapshot(activeMission.id);
  }, [activeMission, loadSnapshot]);

  async function call(path: string, init: RequestInit, key: string): Promise<unknown> {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(path, {
        headers: { "content-type": "application/json" },
        cache: "no-store",
        ...init
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      await load();
      if (activeMission?.status === "posted" || data.snapshot) void loadSnapshot(activeMission?.id ?? data.missionId ?? "");
      return data;
    } finally {
      setBusy(null);
    }
  }

  if (forbidden) {
    return (
      <div className="mx-auto grid max-w-[1180px] gap-5 pb-10 xl:max-w-[1440px] 2xl:max-w-[1640px]">
        <Panel className="border-warn/30 bg-warn/[0.055] p-5 text-sm font-semibold leading-6 text-fg-muted md:p-6">
          {growthLoopDisabledCopy(en)}
        </Panel>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="mx-auto grid max-w-[1180px] gap-5 pb-10 xl:max-w-[1440px] 2xl:max-w-[1640px]">
        <Panel className="min-h-[520px] animate-pulse bg-surface-2/45">
          <span className="sr-only">{en ? "Loading" : "加载中"}</span>
        </Panel>
      </div>
    );
  }

  const planVariants = extractPlanVariants(activeMission);
  const missionKits = kits.filter((kit) => kit.growthMissionId === activeMission?.id);
  const goalPaused = detail.goal.status !== "active";

  const copy = {
    back: en ? "All goals" : "返回目标列表",
    eyebrow: en ? "GROWTH LOOP · GOAL" : "增长闭环 · 目标",
    active: en ? "Active" : "进行中",
    paused: en ? "Paused" : "已暂停",
    metric: en ? "Qualified activations (signup + first library save)" : "有效激活（注册 + 首次保存到内容库）",
    targetLine: en
      ? `Target ${Number(detail.goal.target_value)} · ends ${detail.goal.end_at.slice(0, 10)} · channel Xiaohongshu`
      : `目标值 ${Number(detail.goal.target_value)} · 截止 ${detail.goal.end_at.slice(0, 10)} · 渠道 小红书`,
    attribution: en
      ? "Attribution rule: last tracked click within 90 days before signup, frozen at signup. Untrackable visits stay unattributed."
      : "归因规则：注册前 90 天内最后一次追踪点击，注册时冻结；无法关联的访问计入未归因",
    pausedNote: en
      ? "Paused: new approvals and publications are blocked. Already-published content cannot be recalled."
      : "已暂停：新的批准与发布会被阻止；已发布内容无法自动撤回",
    pause: en ? "Pause goal" : "暂停目标",
    resume: en ? "Resume goal" : "恢复目标",
    experiment: en ? "Current experiment" : "当前实验",
    experimentDetail: en
      ? "One hypothesis with two content variants for an exploratory comparison."
      : "一个假设与两个内容变体，用于探索性比较",
    noExperiment: en ? "No active experiment" : "暂无进行中的实验",
    plan: en ? "Plan next experiment (1 credit)" : "生成下一轮实验计划（消耗 1 积分）",
    planning: en ? "Planning…" : "生成计划中…",
    exploratory: en ? "Exploratory comparison, not a randomized experiment" : "探索性比较，非随机对照实验",
    publish: en ? "Publish & evidence" : "发布与证据",
    publishDetail: en
      ? "Manual or extension-assisted publishing on Xiaohongshu; a pasted post link is recorded as user-reported evidence."
      : "小红书发布为人工或插件辅助；贴入的帖子链接记为用户报告证据",
    tracking: en ? "Tracking link" : "追踪链接",
    results: en ? "Results & review" : "结果与复盘",
    resultsDetail: en
      ? "Reviews only read server-computed numbers; ratios without a denominator show as not computable."
      : "复盘只读服务端计算的数字；分母缺失的比率显示为不可计算",
    runReview: en ? "Run review (1 credit)" : "生成复盘（消耗 1 积分）",
    reviewing: en ? "Reviewing…" : "复盘生成中…",
    log: en ? "Activity log" : "活动日志",
    logDetail: en ? "Every decision on this experiment, in order." : "该实验的每个决定，按时间排列",
    noEvents: en ? "No events yet" : "暂无事件",
    learnings: en ? "Learnings" : "经验",
    learningsDetail: en
      ? "Reviews propose learnings; you accept or reject each one."
      : "复盘产生经验候选，由你采纳或拒绝",
    reviewAs: en ? "Review" : "复盘"
  };

  return (
    <div className="mx-auto grid max-w-[1180px] gap-5 pb-10 xl:max-w-[1440px] 2xl:max-w-[1640px]">
      <Link href="/operations/growth" className="inline-flex items-center gap-1.5 text-xs font-bold text-fg-muted transition hover:text-action">
        <ArrowLeft className="h-3.5 w-3.5" />{copy.back}
      </Link>

      {error ? (
        <div role="alert" className="rounded-xl border border-risk/30 bg-risk/10 px-4 py-3 text-xs font-semibold leading-5 text-risk">
          {error}
        </div>
      ) : null}

      <Panel className="relative overflow-hidden p-6 md:p-8">
        <div className="grain-local" aria-hidden />
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-action/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="eyebrow">{copy.eyebrow}</p>
                <Tag tone={goalPaused ? "neutral" : "success"} dot>{goalPaused ? copy.paused : copy.active}</Tag>
              </div>
              <h1 className="mt-4 max-w-4xl text-balance text-2xl font-black leading-tight text-fg md:text-4xl">{detail.goal.title}</h1>
            </div>
            <Button
              variant="tertiary"
              disabled={busy === "goal-status"}
              onClick={() =>
                void call(
                  `/api/growth-loop/goals/${goalId}`,
                  {
                    method: "PATCH",
                    body: JSON.stringify({ decision: detail.goal.status === "active" ? "pause" : "resume" })
                  },
                  "goal-status"
                )
              }
            >
              {goalPaused ? copy.resume : copy.pause}
            </Button>
          </div>
          <div className="mt-5 grid gap-1.5 text-xs font-medium leading-5 text-fg-muted">
            <p><span className="font-bold text-fg">{en ? "Metric" : "指标"}：</span>{copy.metric}</p>
            <p>{copy.targetLine}</p>
            <p>{copy.attribution}</p>
            {goalPaused ? <p className="font-semibold text-warn">{copy.pausedNote}</p> : null}
          </div>
        </div>
      </Panel>

      <Section
        icon={FlaskConical}
        number="01"
        title={activeMission ? `${en ? "Round" : "第"} ${activeMission.planVersion ?? "-"} ${en ? "hypothesis" : "轮假设"}` : copy.noExperiment}
        detail={copy.experimentDetail}
        action={!activeMission ? (
          <Button
            variant="primary"
            loading={busy === "plan"}
            disabled={goalPaused}
            onClick={() =>
              void call(`/api/growth-loop/goals/${goalId}/plan`, { method: "POST", body: JSON.stringify({}) }, "plan")
            }
          >
            {busy === "plan" ? copy.planning : copy.plan}
          </Button>
        ) : undefined}
      >
        {!activeMission ? (
          <p className="text-sm font-medium leading-6 text-fg-muted">{copy.experimentDetail}</p>
        ) : (
          <div className="grid gap-4">
            <p className="text-sm font-semibold leading-6 text-fg">{activeMission.hypothesis}</p>
            <Tag tone="neutral">{copy.exploratory}</Tag>
            <div className="grid gap-3 md:grid-cols-2">
              {planVariants.map((variant) => (
                <VariantCard
                  key={variant.key}
                  variant={variant}
                  en={en}
                  mission={activeMission}
                  missionKits={missionKits}
                  busy={busy}
                  onBind={async (kitId) => {
                    await call(
                      `/api/growth-loop/missions/${activeMission.id}/variants/${variant.key}/draft`,
                      { method: "POST", body: JSON.stringify({ kitId }) },
                      `bind-${variant.key}`
                    );
                  }}
                  onApprovePrepare={async () => {
                    const prepare = activeMission.actions.find(
                      (action) => action.kind === "prepare_execution_draft" && action.input?.variantKey === variant.key
                    );
                    if (prepare) {
                      await call(
                        `/api/growth-loop/missions/${activeMission.id}/actions/${prepare.id}/decision`,
                        { method: "POST", body: JSON.stringify({ decision: "approve" }) },
                        `approve-${prepare.id}`
                      );
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </Section>

      {activeMission ? (
        <Section icon={Send} number="02" title={copy.publish} detail={copy.publishDetail}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              {activeMission.trackingLinks.map((link) => (
                <p key={link.trackingUrl} className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-fg-muted">
                  <Tag tone="brand">{en ? "Variant" : "变体"} {link.variantKey}</Tag>
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
                  <a className="break-all font-mono underline hover:text-action" href={link.trackingUrl} target="_blank" rel="noreferrer">
                    {link.trackingUrl}
                  </a>
                </p>
              ))}
            </div>
            {activeMission.actions
              .filter((action) => action.kind === "review_and_publish")
              .map((action) => (
                <PublishActionCard
                  key={action.id}
                  action={action}
                  en={en}
                  busy={busy}
                  draft={evidenceDraft[action.id] ?? { url: "", mode: "manual" }}
                  onDraft={(next) => setEvidenceDraft((prev) => ({ ...prev, [action.id]: next }))}
                  onApprove={() =>
                    void call(
                      `/api/growth-loop/missions/${activeMission.id}/actions/${action.id}/decision`,
                      {
                        method: "POST",
                        body: JSON.stringify({ decision: "approve", payloadHash: action.payloadHash })
                      },
                      `approve-${action.id}`
                    )
                  }
                  onEvidence={() =>
                    void call(
                      `/api/growth-loop/missions/${activeMission.id}/actions/${action.id}/evidence`,
                      {
                        method: "POST",
                        body: JSON.stringify({
                          variantKey: action.input?.variantKey,
                          evidenceUrl: (evidenceDraft[action.id] ?? { url: "" }).url,
                          executionMode: (evidenceDraft[action.id] ?? { mode: "manual" as const }).mode,
                          payloadHash: action.payloadHash
                        })
                      },
                      `evidence-${action.id}`
                    )
                  }
                />
              ))}
          </div>
        </Section>
      ) : null}

      <Section icon={History} number={activeMission ? "03" : "02"} title={copy.log} detail={copy.logDetail}>
        <ol className="grid gap-3 border-l-2 border-hairline pl-4">
          {(activeMission?.events ?? []).map((event) => (
            <li key={event.id} className="relative grid gap-0.5 text-xs">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border-2 border-bg bg-hairline" aria-hidden />
              <span className="font-bold text-fg">{event.eventType}</span>
              <span className="font-mono text-[11px] font-medium leading-4 text-fg-muted">
                {new Date(event.occurredAt).toLocaleString()} · {JSON.stringify(event.payload).slice(0, 160)}
              </span>
            </li>
          ))}
          {(activeMission?.events ?? []).length === 0 ? (
            <li className="text-xs font-medium text-fg-muted">{copy.noEvents}</li>
          ) : null}
        </ol>
      </Section>

      <Section
        icon={BarChart3}
        number={activeMission ? "04" : "03"}
        title={copy.results}
        detail={copy.resultsDetail}
        action={activeMission?.status === "posted" ? (
          <Button
            variant="secondary"
            loading={busy === "review"}
            onClick={() =>
              void call(`/api/growth-loop/missions/${activeMission.id}/review`, { method: "POST", body: JSON.stringify({}) }, "review")
            }
          >
            {busy === "review" ? copy.reviewing : copy.runReview}
          </Button>
        ) : undefined}
      >
        {snapshot ? (
          <div className="grid gap-4">
            <p className="text-xs font-semibold text-fg-muted">
              {en ? "Data as of" : "数据截止"} {snapshot.asOf.slice(0, 16).replace("T", " ")} · {en ? "rule" : "口径"} {snapshot.attributionRuleVersion}
            </p>
            <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-hairline">
              <Metric label={en ? "Click visitors" : "独立点击访客"} value={String(snapshot.totals.distinctClickVisitors)} />
              <Metric label={en ? "Attributed signups" : "归因注册"} value={String(snapshot.totals.attributedSignups)} />
              <Metric label={en ? "Activations" : "有效激活"} value={String(snapshot.totals.activations)} />
            </div>
            <div className="grid gap-1.5">
              {snapshot.variants.map((variant) => (
                <p key={variant.key} className="flex flex-wrap items-center gap-2 text-xs font-semibold text-fg">
                  <Tag tone="brand">{en ? "Variant" : "变体"} {variant.key}</Tag>
                  <span className="font-medium text-fg-muted">
                    {en ? "clicks" : "点击"} <span className="tabular-nums text-fg">{variant.distinctClickVisitors}</span> ·{" "}
                    {en ? "signups" : "注册"} <span className="tabular-nums text-fg">{variant.attributedSignups}</span> ·{" "}
                    {en ? "activations" : "激活"} <span className="tabular-nums text-fg">{variant.activations}</span>
                  </span>
                </p>
              ))}
            </div>
            <p className="text-xs font-medium leading-5 text-fg-muted">
              {en ? "Unattributed signups" : "未归因注册"}：{snapshot.totals.unattributedSignups ?? (en ? "not available" : "不可用")} ·{" "}
              {en ? "cost per activation" : "每激活已知成本"}：
              {snapshot.ratios.costPerActivationCredits === null
                ? en ? "not computable" : "不可计算"
                : `${snapshot.ratios.costPerActivationCredits.toFixed(2)} ${en ? "credits" : "积分"}`}
              （{snapshot.cost.scopeNote}）
            </p>
            <ul className="grid gap-1 text-[11px] font-medium leading-4 text-fg-muted">
              {snapshot.limitations.map((limitation) => (
                <li key={limitation}>· {limitation}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs font-medium leading-5 text-fg-muted">
            {activeMission?.status === "posted"
              ? en ? "Snapshot loads after publication; counts with no denominator show as not computable."
                : "发布后可加载快照；分母缺失的比率显示为不可计算"
              : en ? "Results appear after the experiment is published and measured."
                : "实验发布并进入测量后才会出现结果"}
          </p>
        )}
        {(activeMission?.reviewHistory ?? []).length > 0 ? (
          <div className="mt-5 grid gap-3 border-t border-hairline pt-5">
            {(activeMission?.reviewHistory ?? []).map((review) => (
              <div key={review.reviewVersion} className="grid gap-1.5 rounded-xl bg-surface-2/45 p-4 text-xs">
                <span className="font-bold text-fg">
                  {copy.reviewAs} v{review.reviewVersion} · {review.conclusion}
                </span>
                <p className="font-medium leading-5 text-fg-muted">{review.narrative}</p>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      <Section icon={Lightbulb} number={activeMission ? "05" : "04"} title={copy.learnings} detail={copy.learningsDetail}>
        {(detail.learnings ?? []).length === 0 ? (
          <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-hairline bg-surface-2/30 px-4 py-8 text-center">
            <Lightbulb className="h-5 w-5 text-fg-muted" />
            <p className="text-sm font-semibold text-fg-muted">{copy.learningsDetail}</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {(detail.learnings ?? []).map((learning) => (
              <LearningCard
                key={learning.id}
                learning={learning}
                en={en}
                busy={busy === `learning-${learning.id}`}
                onDecision={(decision) =>
                  void call(
                    `/api/growth-loop/learnings/${learning.id}/decision`,
                    { method: "POST", body: JSON.stringify({ decision }) },
                    `learning-${learning.id}`
                  )
                }
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  icon: Icon,
  number,
  title,
  detail,
  action,
  children
}: {
  icon: typeof Target;
  number: string;
  title: string;
  detail: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Panel className="p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-2 text-action"><Icon className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black tracking-[0.18em] text-fg-muted">{number}</p>
            <h2 className="mt-1 text-lg font-black text-fg">{title}</h2>
            <p className="mt-1 text-xs font-medium leading-5 text-fg-muted">{detail}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-hairline p-4 last:border-r-0 sm:border-b-0">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-fg-muted">{label}</p>
      <p className="mt-2 text-2xl font-black tabular-nums text-fg">{value}</p>
    </div>
  );
}

function extractPlanVariants(mission: MissionView | null): VariantPlan[] {
  if (!mission) return [];
  const raw = (mission as unknown as { plan?: { variants?: VariantPlan[] } }).plan?.variants;
  return raw ?? [];
}

function VariantCard({
  variant,
  en,
  mission,
  missionKits,
  busy,
  onBind,
  onApprovePrepare
}: {
  variant: VariantPlan;
  en: boolean;
  mission: MissionView;
  missionKits: KitOption[];
  busy: string | null;
  onBind: (kitId: string) => Promise<void>;
  onApprovePrepare: () => Promise<void>;
}) {
  const [selectedKit, setSelectedKit] = useState("");
  const prepare = mission.actions.find(
    (action) => action.kind === "prepare_execution_draft" && action.input?.variantKey === variant.key
  );
  const boundKit = variant.kitId ?? undefined;

  return (
    <div className={`grid content-start gap-3 rounded-xl border p-4 transition ${boundKit ? "border-action/55 bg-action/[0.08]" : "border-hairline bg-surface-2/45"}`}>
      <div className="flex items-center justify-between gap-2">
        <Tag tone="brand">{en ? "Variant" : "变体"} {variant.key}</Tag>
        {boundKit ? <Tag tone="success" dot>{en ? "Draft bound" : "已绑定草稿"}</Tag> : null}
      </div>
      <p className="text-sm font-bold leading-5 text-fg">{variant.angle}</p>
      <p className="text-xs font-medium leading-5 text-fg-muted">{variant.workbenchIdea}</p>
      {boundKit ? (
        <p className="font-mono text-[11px] font-semibold text-fg-muted">{boundKit.slice(0, 8)}…</p>
      ) : prepare?.status === "awaiting_approval" ? (
        <Button variant="secondary" size="sm" disabled={busy !== null} loading={busy?.startsWith("approve-") ?? false} onClick={() => void onApprovePrepare()}>
          {en ? "Approve draft generation" : "批准生成草稿"}
        </Button>
      ) : (
        <div className="grid gap-2">
          <select
            className="field-input text-xs"
            value={selectedKit}
            onChange={(event) => setSelectedKit(event.target.value)}
          >
            <option value="">{en ? "Select the kit generated for this variant" : "选择为该变体生成的内容包"}</option>
            {missionKits.map((kit) => (
              <option key={kit.id} value={kit.id}>
                {kit.createdAt.slice(0, 10)} · {kit.ideaText.slice(0, 24)}
              </option>
            ))}
          </select>
          <Button variant="tertiary" size="sm" disabled={!selectedKit || busy !== null} onClick={() => void onBind(selectedKit)}>
            {en ? "Bind draft to variant" : "绑定草稿到该变体"}
          </Button>
          <p className="text-[11px] font-medium leading-4 text-fg-muted">
            {en
              ? "Approve the variant, generate in the Studio from the opened link, then pick the saved kit here."
              : "先批准变体并从打开的链接进入创作台生成，保存后回到这里选择内容包"}
          </p>
        </div>
      )}
    </div>
  );
}

function PublishActionCard({
  action,
  en,
  busy,
  draft,
  onDraft,
  onApprove,
  onEvidence
}: {
  action: MissionActionView;
  en: boolean;
  busy: string | null;
  draft: { url: string; mode: "manual" | "assisted" };
  onDraft: (next: { url: string; mode: "manual" | "assisted" }) => void;
  onApprove: () => void;
  onEvidence: () => void;
}) {
  const variantKey = typeof action.input?.variantKey === "string" ? action.input.variantKey : "?";
  return (
    <div className="grid gap-3 rounded-xl border border-hairline bg-surface-2/45 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="brand">{en ? "Variant" : "变体"} {variantKey}</Tag>
        <Tag tone={action.status === "succeeded" ? "success" : action.status === "running" ? "info" : "neutral"} dot>{action.status}</Tag>
        {action.evidenceLevel !== "unverified" ? <Tag tone="warn">{action.evidenceLevel}</Tag> : null}
      </div>
      {action.status === "awaiting_approval" ? (
        <div className="grid gap-2">
          <Button variant="primary" size="sm" disabled={busy !== null} onClick={onApprove}>
            {en ? "Approve this exact content version" : "批准该内容版本"}
          </Button>
          <p className="text-[11px] font-medium leading-4 text-fg-muted">
            {en
              ? "The content version is hash-pinned; editing the kit after approval invalidates this approval."
              : "内容版本已被哈希钉定；批准后再改内容会使本次批准失效"}
          </p>
        </div>
      ) : null}
      {action.status === "running" ? (
        <div className="grid gap-2 sm:max-w-md">
          <input
            className="field-input text-xs"
            type="url"
            placeholder="https://www.xiaohongshu.com/…"
            value={draft.url}
            onChange={(event) => onDraft({ ...draft, url: event.target.value })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="field-input w-auto text-xs"
              value={draft.mode}
              onChange={(event) => onDraft({ ...draft, mode: event.target.value as "manual" | "assisted" })}
            >
              <option value="manual">{en ? "Published manually" : "人工发布"}</option>
              <option value="assisted">{en ? "Published with extension assist" : "插件辅助发布"}</option>
            </select>
            <Button variant="secondary" size="sm" disabled={!draft.url || busy !== null} onClick={onEvidence}>
              <Send className="h-3.5 w-3.5" />{en ? "Submit post link" : "提交发布链接"}
            </Button>
          </div>
        </div>
      ) : null}
      {action.evidenceUrl ? (
        <a className="break-all text-[11px] font-semibold underline hover:text-action" href={action.evidenceUrl} target="_blank" rel="noreferrer">
          {action.evidenceUrl}
        </a>
      ) : null}
    </div>
  );
}

function LearningCard({
  learning,
  en,
  busy,
  onDecision
}: {
  learning: LearningView;
  en: boolean;
  busy: boolean;
  onDecision: (decision: "accept" | "reject" | "revoke") => void;
}) {
  return (
    <div className="grid gap-2 rounded-xl border border-hairline bg-surface-2/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tag tone={learning.status === "accepted" ? "success" : learning.status === "candidate" ? "info" : "neutral"} dot>
          {learning.status}
        </Tag>
        <div className="flex items-center gap-2">
          {learning.status === "candidate" ? (
            <>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => onDecision("accept")}>
                {en ? "Accept" : "采纳"}
              </Button>
              <Button variant="tertiary" size="sm" disabled={busy} onClick={() => onDecision("reject")}>
                {en ? "Reject" : "拒绝"}
              </Button>
            </>
          ) : learning.status === "accepted" ? (
            <Button variant="tertiary" size="sm" disabled={busy} onClick={() => onDecision("revoke")}>
              {en ? "Revoke" : "撤销"}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs font-semibold leading-5 text-fg">{learning.statement}</p>
      {learning.limitations ? (
        <p className="text-[11px] font-medium leading-4 text-fg-muted">{en ? "Limits" : "局限"}：{learning.limitations}</p>
      ) : null}
    </div>
  );
}
