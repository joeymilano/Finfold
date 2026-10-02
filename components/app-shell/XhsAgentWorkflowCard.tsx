"use client";

import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Compass,
  Loader2,
  RotateCcw,
  Sparkles
} from "@/components/ui/icons";
import type {
  XhsWorkflowCompletionReceipt,
  XhsWorkflowStage,
  XhsWorkflowState
} from "@/lib/agent/xhs-workflow";

type Locale = "zh" | "en";

type XhsCardPayload = {
  kind: "positioning" | "campaign" | "topics" | "draft" | "titles" | "visual" | "review" | "next_action";
  eyebrow: string;
  title: string;
  summary: string;
  items?: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
};

type PendingActionPayload = {
  id: string;
  workflowId?: string;
  actionKind: string;
  expiresAt?: string;
};

type XhsActionStatus = "pending" | "executed" | "reverted";

const MACRO_STAGES: Array<{
  id: string;
  zh: string;
  en: string;
  stages: XhsWorkflowStage[];
}> = [
  { id: "positioning", zh: "定位", en: "Position", stages: ["positioning"] },
  { id: "topic", zh: "选题", en: "Topic", stages: ["topic"] },
  { id: "create", zh: "创作", en: "Create", stages: ["draft", "title"] },
  { id: "visual", zh: "视觉", en: "Visual", stages: ["visual"] },
  { id: "learn", zh: "发布复盘", en: "Learn", stages: ["publish", "review"] }
];

export function XhsTodayActionCard({
  state,
  loading,
  locale,
  onAskAgent
}: {
  state: XhsWorkflowState | null;
  loading: boolean;
  locale: Locale;
  onAskAgent: (prompt: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const action = state?.nextAction;
  const activeStage = state?.workflow?.stage ?? "positioning";
  const activeMacro = MACRO_STAGES.findIndex((item) => item.stages.includes(activeStage));
  const zh = locale === "zh";

  if (loading && !state) {
    return (
      <div className="mb-5 flex min-h-36 items-center justify-center rounded-xl border border-brand/20 bg-brand/[0.04] text-sm text-fg-muted">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-brand" />
        {zh ? "读取小红书运营状态…" : "Loading Xiaohongshu workflow…"}
      </div>
    );
  }
  if (!action) return null;

  const isAgentAction = action.href.startsWith("/dashboard") || action.href.startsWith("/agents");
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mb-5 overflow-hidden rounded-xl border border-brand/35 bg-[linear-gradient(135deg,rgb(var(--brand)/0.14),rgb(var(--surface)/0.92)_48%,rgb(var(--surface-2)/0.7))] p-4 shadow-panel sm:p-5"
      aria-label={zh ? "小红书今日行动" : "Xiaohongshu next action"}
    >
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/35 bg-brand/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand-strong dark:text-brand">
              <Compass className="h-3.5 w-3.5" />
              {zh ? "小红书今日行动" : "XHS next move"}
            </span>
            <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${
              action.confidence === "measured"
                ? "border-positive/30 bg-positive/10 text-positive"
                : "border-hairline bg-surface/65 text-fg-muted"
            }`}>
              {action.confidence === "measured"
                ? (zh ? "真实数据" : "Measured")
                : action.confidence === "inferred"
                  ? (zh ? "证据推断" : "Inferred")
                  : (zh ? "策略假设" : "Hypothesis")}
            </span>
          </div>
          <h2 className="mt-3 text-xl font-black tracking-tight text-fg sm:text-2xl">{action.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-muted">{action.reason}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-hairline bg-surface/65 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-fg-muted/75">{zh ? "判断依据" : "Evidence"}</p>
              <p className="mt-1 text-xs leading-5 text-fg-muted">{action.evidence}</p>
            </div>
            <div className="rounded-lg border border-hairline bg-surface/65 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-fg-muted/75">{zh ? "这一轮只看" : "One metric"}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-brand-strong dark:text-brand">{action.targetMetric ?? (zh ? "先完成策略确认" : "Confirm the strategy first")}</p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-row gap-2 lg:w-48 lg:flex-col">
          {isAgentAction ? (
            <button
              type="button"
              onClick={() => onAskAgent(action.prompt)}
              className="btn-primary min-h-11 flex-1 justify-center px-4 text-sm"
            >
              {zh ? "开始这一步" : "Start this step"}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <Link href={action.href} className="btn-primary min-h-11 flex-1 justify-center px-4 text-sm">
              {zh ? "继续执行" : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-hairline bg-surface/65 px-3 text-xs font-bold text-fg-muted transition hover:border-brand/35 hover:text-fg"
            aria-expanded={expanded}
          >
            {zh ? "完整流程" : "Full flow"}
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="relative mt-5 grid grid-cols-5 gap-1.5 border-t border-hairline pt-4">
          {MACRO_STAGES.map((item, index) => {
            const complete = index < activeMacro;
            const active = index === activeMacro;
            return (
              <div key={item.id} className="min-w-0">
                <div className={`h-1 rounded-full ${complete || active ? "bg-brand" : "bg-hairline"}`} />
                <div className="mt-2 flex items-center gap-1.5">
                  {complete ? <Check className="h-3 w-3 shrink-0 text-positive" /> : <CircleDot className={`h-3 w-3 shrink-0 ${active ? "text-brand" : "text-fg-muted/35"}`} />}
                  <span className={`truncate text-[10px] font-bold ${active ? "text-fg" : "text-fg-muted"}`}>
                    {zh ? item.zh : item.en}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {state?.dataStatus.limitation ? (
        <p className="relative mt-3 text-[11px] leading-5 text-fg-muted">{state.dataStatus.limitation}</p>
      ) : null}
    </motion.section>
  );
}

export function XhsToolResultCard({
  result,
  locale,
  onStateChanged,
  onActionStatusChanged,
  demoMode = false
}: {
  result: unknown;
  locale: Locale;
  onStateChanged?: (state: XhsWorkflowState) => void;
  onActionStatusChanged?: (pendingActionId: string, status: XhsActionStatus) => void;
  demoMode?: boolean;
}) {
  const payload = asRecord(result);
  const card = payload.xhsCard as XhsCardPayload | undefined;
  const pending = payload.pendingAction as PendingActionPayload | undefined;
  const [selection, setSelection] = useState<string | number | undefined>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reverted, setReverted] = useState(false);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [completionReceipt, setCompletionReceipt] = useState<XhsWorkflowCompletionReceipt | null>(null);
  const [workbenchHref, setWorkbenchHref] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statusVersionRef = useRef(0);
  const zh = locale === "zh";

  const selectable = card?.kind === "topics" || card?.kind === "titles";
  const items = useMemo(() => card?.items ?? [], [card?.items]);
  const cardWorkbenchHref = safeWorkbenchHref(card?.meta?.href);

  useEffect(() => {
    if (!pending?.id || !card || demoMode) return;
    const pendingActionId = pending.id;
    let cancelled = false;
    const requestVersion = statusVersionRef.current;
    const cached = readRememberedActionStatus(pendingActionId);
    if (cached) {
      applyStatus(cached.status, cardWorkbenchHref ?? cached.workbenchHref, cached.auditId ?? null, cached.completionReceipt ?? null);
    }

    void fetch(`/api/agent/xhs/actions?pendingActionId=${encodeURIComponent(pendingActionId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return await response.json() as {
          status?: string;
          auditId?: string | null;
          completionReceipt?: XhsWorkflowCompletionReceipt | null;
          workbenchHref?: string | null;
        };
      })
      .then((data) => {
        if (!data || cancelled || requestVersion !== statusVersionRef.current) return;
        const status = actionStatus(data.status);
        const resolvedHref = cardWorkbenchHref ?? safeWorkbenchHref(data.workbenchHref);
        applyStatus(status, resolvedHref, data.auditId ?? null, data.completionReceipt ?? null);
        rememberActionStatus(pendingActionId, {
          status,
          workbenchHref: resolvedHref,
          auditId: data.auditId ?? null,
          completionReceipt: data.completionReceipt ?? null
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };

    function applyStatus(
      status: XhsActionStatus,
      href: string | null,
      nextAuditId: string | null,
      receipt: XhsWorkflowCompletionReceipt | null
    ) {
      if (cancelled) return;
      setSaved(status === "executed");
      setReverted(status === "reverted");
      setAuditId(nextAuditId);
      setCompletionReceipt(status === "executed" ? receipt : null);
      setWorkbenchHref(status === "executed" ? href : null);
      onActionStatusChanged?.(pendingActionId, status);
    }
  }, [card, cardWorkbenchHref, demoMode, onActionStatusChanged, pending?.id]);

  if (!card) return null;

  async function confirm() {
    if (!pending?.id || (selectable && selection === undefined)) return;
    setSaving(true);
    setError(null);
    statusVersionRef.current += 1;
    if (demoMode) {
      window.setTimeout(() => {
        setSaved(true);
        setReverted(false);
        setAuditId("preview-audit");
        setWorkbenchHref(cardWorkbenchHref);
        onActionStatusChanged?.(pending.id, "executed");
        setSaving(false);
      }, 320);
      return;
    }
    try {
      const response = await fetch("/api/agent/xhs/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingActionId: pending.id, selection })
      });
      const data = (await response.json().catch(() => ({}))) as {
        state?: XhsWorkflowState;
        auditId?: string | null;
        completionReceipt?: XhsWorkflowCompletionReceipt | null;
        error?: string;
      };
      if (!response.ok || !data.state) throw new Error(data.error ?? (zh ? "暂时无法确认这一步。" : "Unable to confirm this step."));
      setSaved(true);
      setReverted(false);
      setAuditId(data.auditId ?? null);
      setCompletionReceipt(data.completionReceipt ?? null);
      const resolvedHref =
        safeWorkbenchHref(data.state.nextAction.href)
          ?? cardWorkbenchHref;
      setWorkbenchHref(resolvedHref);
      rememberActionStatus(pending.id, {
        status: "executed",
        workbenchHref: resolvedHref,
        auditId: data.auditId ?? null,
        completionReceipt: data.completionReceipt ?? null
      });
      onActionStatusChanged?.(pending.id, "executed");
      onStateChanged?.(data.state);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (zh ? "暂时无法确认这一步。" : "Unable to confirm this step."));
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    if (!auditId) return;
    setSaving(true);
    setError(null);
    statusVersionRef.current += 1;
    if (demoMode) {
      window.setTimeout(() => {
        setSaved(false);
        setReverted(true);
        setAuditId(null);
        onActionStatusChanged?.(pending?.id ?? "preview-action", "reverted");
        setSaving(false);
      }, 220);
      return;
    }
    try {
      const response = await fetch(`/api/agent/actions/${auditId}/undo`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { undone?: boolean; error?: string };
      if (!response.ok || !data.undone) throw new Error(data.error ?? (zh ? "撤销失败。" : "Undo failed."));
      setSaved(false);
      setReverted(true);
      setWorkbenchHref(null);
      if (pending?.id) {
        rememberActionStatus(pending.id, { status: "reverted", workbenchHref: null, auditId, completionReceipt: null });
        onActionStatusChanged?.(pending.id, "reverted");
      }
      const stateResponse = await fetch(`/api/agent/xhs/state?locale=${locale}`, { cache: "no-store" });
      const stateData = (await stateResponse.json()) as { state?: XhsWorkflowState };
      if (stateData.state) onStateChanged?.(stateData.state);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (zh ? "撤销失败。" : "Undo failed."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-brand/25 bg-[linear-gradient(145deg,rgb(var(--brand)/0.1),rgb(var(--surface)/0.94)_56%,rgb(var(--surface-2)/0.72))]">
      <div className="border-b border-hairline p-3.5">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-brand-strong dark:text-brand">
          <Sparkles className="h-3.5 w-3.5" />
          {card.eyebrow}
        </p>
        <h3 className="mt-2 text-base font-black leading-6 text-fg">{card.title}</h3>
        <p className="mt-1 text-xs leading-5 text-fg-muted">{card.summary}</p>
      </div>

      {items.length > 0 ? (
        <div className="grid gap-2 p-3">
          {items.map((item, index) => {
            const candidateId = candidateValue(item, index);
            const selected = selection === candidateId || (!selectable && index === 0);
            const content = <ArtifactItem item={item} index={index} locale={locale} />;
            return selectable ? (
              <button
                type="button"
                key={candidateId}
                onClick={() => setSelection(candidateId)}
                className={`rounded-lg border p-3 text-left transition ${
                  selected ? "border-brand/60 bg-brand/12 shadow-[inset_3px_0_0_rgb(var(--brand))]" : "border-hairline bg-surface/55 hover:border-brand/30"
                }`}
              >
                {content}
              </button>
            ) : (
              <div key={candidateId} className="rounded-lg border border-hairline bg-surface/55 p-3">
                {content}
              </div>
            );
          })}
        </div>
      ) : null}

      <ArtifactMeta meta={card.meta} locale={locale} showHref={!pending} />

      {saved && workbenchHref ? (
        <section className="border-t border-positive/20 bg-positive/[0.04] p-3" aria-label={zh ? "创作台交接" : "Workbench handoff"}>
          <p className="flex items-center gap-2 text-xs font-black text-positive">
            <span className="grid h-5 w-5 place-items-center rounded-full border border-positive/35 bg-positive/10" aria-hidden="true">
              <Check className="h-3 w-3" />
            </span>
            {zh ? "已转接至创作台" : "Handed off to Workbench"}
          </p>
          <p className="mt-1.5 text-[11px] leading-5 text-fg-muted">
            {zh ? "打开后会载入新选题与确认产物；完成生成后，内容包会自动进入内容库。" : "Open it to load the new topic and approved artifacts. The package enters Content Library after generation."}
          </p>
          <Link href={workbenchHref} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-strong hover:underline dark:text-brand">
            {zh ? "载入创作台" : "Load in Workbench"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      ) : null}

      {saved && !workbenchHref && !completionReceipt ? (
        <section className="flex items-center gap-2 border-t border-positive/20 bg-positive/[0.04] p-3 text-xs font-bold text-positive" aria-label={zh ? "确认完成" : "Confirmation complete"}>
          <Check className="h-3.5 w-3.5" />
          {zh ? "已确认并保存" : "Confirmed and saved"}
        </section>
      ) : null}

      {reverted ? (
        <section className="border-t border-hairline bg-surface/55 p-3" aria-label={zh ? "确认已撤销" : "Confirmation reverted"}>
          <p className="text-xs font-bold text-fg-muted">{zh ? "这次确认已撤销" : "This confirmation was reverted"}</p>
          <p className="mt-1 text-[11px] leading-5 text-fg-muted/75">{zh ? "如需再次采用，请让 Agent 重新准备确认。" : "Ask the Agent to prepare a new confirmation if you want to adopt it again."}</p>
        </section>
      ) : null}

      {pending && !saved && !reverted ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline p-3">
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={saving || (selectable && selection === undefined)}
            className="btn-primary min-h-10 px-4 text-xs disabled:opacity-45"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {error
              ? (zh ? "重试确认" : "Retry confirmation")
              : confirmationLabel(card.kind, zh)}
          </button>
          {selectable && selection === undefined && !saved ? (
            <span className="text-[11px] text-fg-muted/75">{zh ? "先选择一个候选" : "Choose one candidate first"}</span>
          ) : null}
        </div>
      ) : null}
      {saved && auditId && !workbenchHref ? (
        <div className="border-t border-hairline px-3 py-2">
          <button
            type="button"
            onClick={() => void undo()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-fg-muted transition hover:text-fg"
          >
            <RotateCcw className="h-3 w-3" />
            {zh ? "撤销确认" : "Undo confirmation"}
          </button>
        </div>
      ) : null}
      {completionReceipt ? (
        <section className="border-t border-positive/20 bg-positive/[0.04] p-3" aria-label={zh ? "本轮复盘回执" : "Review completion receipt"}>
          <p className="flex items-center gap-1.5 text-xs font-bold text-positive">
            <Check className="h-3.5 w-3.5" />
            {zh ? "本轮真实表现复盘已保存" : "Performance review saved"}
          </p>
          <p className="mt-1 text-xs leading-5 text-fg-muted">{completionReceipt.summary}</p>
          {completionReceipt.evidence ? <p className="mt-1 text-[11px] leading-4 text-fg-muted/80">{completionReceipt.evidence}</p> : null}
          {completionReceipt.primaryMetric ? <p className="mt-2 text-[11px] font-bold text-brand-strong dark:text-brand">{zh ? "下一轮只看：" : "Next metric: "}{completionReceipt.primaryMetric}</p> : null}
          <Link href={completionReceipt.nextAction.href} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-strong hover:underline dark:text-brand">
            {zh ? `下一步：${completionReceipt.nextAction.title}` : `Next: ${completionReceipt.nextAction.title}`}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </section>
      ) : null}
      {error ? <p className="border-t border-risk/20 bg-risk/5 px-3 py-2 text-xs text-risk">{error}</p> : null}
    </div>
  );
}

function ArtifactItem({ item, index, locale }: { item: Record<string, unknown>; index: number; locale: Locale }) {
  const title = string(item.title) || string(item.headline) || string(item.topic) || string(item.label) || `${locale === "zh" ? "步骤" : "Step"} ${index + 1}`;
  const detail = string(item.rationale) || string(item.value) || string(item.evidence) || string(item.bodyHint) || string(item.angle);
  const score = typeof item.score === "number" ? item.score : null;
  const jev = item.jev && typeof item.jev === "object" ? item.jev as Record<string, unknown> : null;
  const jevFit = jev && typeof jev.fit === "number" ? jev.fit : null;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold leading-5 text-fg">{title}</p>
        {detail ? <p className="mt-0.5 text-[11px] leading-4 text-fg-muted">{detail}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {jev?.best === true ? (
          <span className="shrink-0 rounded-full bg-action/10 px-2 py-0.5 text-[10px] font-bold text-action">
            {locale === "zh" ? (jevFit !== null ? `推荐 · 匹配度 ${jevFit.toFixed(1)}/4` : "推荐") : jevFit !== null ? `Top pick · fit ${jevFit.toFixed(1)}/4` : "Top pick"}
          </span>
        ) : null}
        {score !== null ? (
          <span className="shrink-0 rounded-md border border-brand/25 bg-brand/10 px-2 py-1 text-xs font-black text-brand-strong dark:text-brand">{score}</span>
        ) : null}
      </div>
    </div>
  );
}

function ArtifactMeta({ meta, locale, showHref = true }: { meta?: Record<string, unknown>; locale: Locale; showHref?: boolean }) {
  if (!meta) return null;
  const limitations = stringArray(meta.limitations);
  const evidenceGaps = stringArray(meta.evidenceGaps);
  const qa = stringArray(meta.qa);
  const labels = [...limitations, ...evidenceGaps, ...qa].slice(0, 4);
  const targetMetric = string(meta.targetMetric) || string(meta.primaryMetric);
  // The handoff link depends only on meta.href — a next-action card without a
  // target metric still has to surface its "continue in Workbench" entry.
  const href = showHref && string(meta.href) ? string(meta.href) : null;
  if (labels.length === 0 && !targetMetric && !href) return null;
  return (
    <div className="border-t border-hairline px-3 py-2.5 text-[11px] leading-5 text-fg-muted">
      {targetMetric ? (
        <p className="flex items-center gap-1.5 font-bold text-brand-strong dark:text-brand">
          <BarChart3 className="h-3.5 w-3.5" />
          {locale === "zh" ? "唯一主指标：" : "Primary metric: "}{targetMetric}
        </p>
      ) : null}
      {labels.map((item) => <p key={item}>· {item}</p>)}
      {href ? (
        <Link href={href} className="mt-1 inline-flex items-center gap-1 font-bold text-brand-strong hover:underline dark:text-brand">
          {locale === "zh" ? "继续执行" : "Continue"} <ArrowRight className="h-3 w-3" />
        </Link>
      ) : null}
    </div>
  );
}

function confirmationLabel(kind: XhsCardPayload["kind"], zh: boolean): string {
  if (kind === "campaign") return zh ? "采用整套方案" : "Adopt campaign plan";
  if (kind === "positioning") return zh ? "确认这个定位" : "Confirm positioning";
  if (kind === "topics") return zh ? "选择这个选题" : "Choose topic";
  if (kind === "draft") return zh ? "确认正文方向" : "Confirm draft";
  if (kind === "titles") return zh ? "选择这个标题" : "Choose title";
  if (kind === "visual") return zh ? "确认视觉方案" : "Confirm visual plan";
  if (kind === "review") return zh ? "采纳复盘，安排下一轮" : "Accept review";
  return zh ? "确认" : "Confirm";
}

function candidateValue(item: Record<string, unknown>, index: number): string {
  return string(item.id) || string(item.title) || string(item.name) || string(item.topic) || `candidate-${index}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(readableMetaValue).map((item) => item.trim()).filter(Boolean))];
}

function readableMetaValue(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value] : [];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const item = value as Record<string, unknown>;
  for (const key of ["label", "title", "text", "description", "message", "check", "criterion", "item", "name", "value"]) {
    const candidate = item[key];
    if (typeof candidate === "string" && candidate.trim()) return [candidate];
  }
  return Object.values(item)
    .filter((candidate): candidate is string => typeof candidate === "string" && Boolean(candidate.trim()))
    .slice(0, 1);
}

function safeWorkbenchHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  return href === "/workbench" || href.startsWith("/workbench?") ? href : null;
}

type RememberedActionStatus = {
  status: XhsActionStatus;
  workbenchHref: string | null;
  auditId: string | null;
  completionReceipt: XhsWorkflowCompletionReceipt | null;
};

function actionStatus(value: unknown): XhsActionStatus {
  return value === "executed" || value === "reverted" ? value : "pending";
}

function actionStatusStorageKey(pendingActionId: string): string {
  return `finfold:xhs-action-status:${pendingActionId}`;
}

function readRememberedActionStatus(pendingActionId: string): RememberedActionStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(actionStatusStorageKey(pendingActionId)) ?? "null") as Partial<RememberedActionStatus> | null;
    if (!parsed) return null;
    return {
      status: actionStatus(parsed.status),
      workbenchHref: safeWorkbenchHref(parsed.workbenchHref),
      auditId: typeof parsed.auditId === "string" ? parsed.auditId : null,
      completionReceipt: parsed.completionReceipt && typeof parsed.completionReceipt === "object"
        ? parsed.completionReceipt as XhsWorkflowCompletionReceipt
        : null
    };
  } catch {
    return null;
  }
}

function rememberActionStatus(pendingActionId: string, status: RememberedActionStatus): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(actionStatusStorageKey(pendingActionId), JSON.stringify(status));
  } catch {
    /* Server status remains the source of truth when local storage is unavailable. */
  }
}
