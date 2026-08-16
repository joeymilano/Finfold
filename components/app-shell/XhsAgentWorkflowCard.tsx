"use client";

import React from "react";
import { useMemo, useState } from "react";
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
      <div className="mb-5 flex min-h-36 items-center justify-center rounded-xl border border-brand/20 bg-brand/[0.04] text-sm text-white/45">
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
      className="relative mb-5 overflow-hidden rounded-xl border border-brand/35 bg-[linear-gradient(135deg,rgba(207,161,79,0.14),rgba(255,255,255,0.035)_48%,rgba(255,255,255,0.015))] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.2)] sm:p-5"
      aria-label={zh ? "小红书今日行动" : "Xiaohongshu next action"}
    >
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/35 bg-brand/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-brand">
              <Compass className="h-3.5 w-3.5" />
              {zh ? "小红书今日行动" : "XHS next move"}
            </span>
            <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${
              action.confidence === "measured"
                ? "border-positive/30 bg-positive/10 text-positive"
                : "border-white/10 bg-white/[0.04] text-white/45"
            }`}>
              {action.confidence === "measured"
                ? (zh ? "真实数据" : "Measured")
                : action.confidence === "inferred"
                  ? (zh ? "证据推断" : "Inferred")
                  : (zh ? "策略假设" : "Hypothesis")}
            </span>
          </div>
          <h2 className="mt-3 text-xl font-black tracking-tight text-white sm:text-2xl">{action.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/62">{action.reason}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/10 bg-black/15 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">{zh ? "判断依据" : "Evidence"}</p>
              <p className="mt-1 text-xs leading-5 text-white/68">{action.evidence}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/15 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">{zh ? "这一轮只看" : "One metric"}</p>
              <p className="mt-1 text-xs font-bold leading-5 text-brand">{action.targetMetric ?? (zh ? "先完成策略确认" : "Confirm the strategy first")}</p>
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
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-xs font-bold text-white/62 transition hover:border-brand/35 hover:text-white"
            aria-expanded={expanded}
          >
            {zh ? "完整流程" : "Full flow"}
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="relative mt-5 grid grid-cols-5 gap-1.5 border-t border-white/10 pt-4">
          {MACRO_STAGES.map((item, index) => {
            const complete = index < activeMacro;
            const active = index === activeMacro;
            return (
              <div key={item.id} className="min-w-0">
                <div className={`h-1 rounded-full ${complete || active ? "bg-brand" : "bg-white/10"}`} />
                <div className="mt-2 flex items-center gap-1.5">
                  {complete ? <Check className="h-3 w-3 shrink-0 text-positive" /> : <CircleDot className={`h-3 w-3 shrink-0 ${active ? "text-brand" : "text-white/20"}`} />}
                  <span className={`truncate text-[10px] font-bold ${active ? "text-white" : "text-white/38"}`}>
                    {zh ? item.zh : item.en}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {state?.dataStatus.limitation ? (
        <p className="relative mt-3 text-[11px] leading-5 text-white/38">{state.dataStatus.limitation}</p>
      ) : null}
    </motion.section>
  );
}

export function XhsToolResultCard({
  result,
  locale,
  onStateChanged,
  demoMode = false
}: {
  result: unknown;
  locale: Locale;
  onStateChanged?: (state: XhsWorkflowState) => void;
  demoMode?: boolean;
}) {
  const payload = asRecord(result);
  const card = payload.xhsCard as XhsCardPayload | undefined;
  const pending = payload.pendingAction as PendingActionPayload | undefined;
  const [selection, setSelection] = useState<string | number | undefined>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [completionReceipt, setCompletionReceipt] = useState<XhsWorkflowCompletionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const zh = locale === "zh";

  const selectable = card?.kind === "topics" || card?.kind === "titles";
  const items = useMemo(() => card?.items ?? [], [card?.items]);
  if (!card) return null;

  async function confirm() {
    if (!pending?.id || (selectable && selection === undefined)) return;
    setSaving(true);
    setError(null);
    if (demoMode) {
      window.setTimeout(() => {
        setSaved(true);
        setAuditId("preview-audit");
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
      if (!response.ok || !data.state) throw new Error(data.error ?? "Unable to confirm this step.");
      setSaved(true);
      setAuditId(data.auditId ?? null);
      setCompletionReceipt(data.completionReceipt ?? null);
      onStateChanged?.(data.state);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to confirm this step.");
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    if (!auditId) return;
    setSaving(true);
    setError(null);
    if (demoMode) {
      window.setTimeout(() => {
        setSaved(false);
        setAuditId(null);
        setSaving(false);
      }, 220);
      return;
    }
    try {
      const response = await fetch(`/api/agent/actions/${auditId}/undo`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { undone?: boolean; error?: string };
      if (!response.ok || !data.undone) throw new Error(data.error ?? "Undo failed.");
      setSaved(false);
      setAuditId(null);
      const stateResponse = await fetch(`/api/agent/xhs/state?locale=${locale}`, { cache: "no-store" });
      const stateData = (await stateResponse.json()) as { state?: XhsWorkflowState };
      if (stateData.state) onStateChanged?.(stateData.state);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Undo failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-brand/25 bg-[linear-gradient(145deg,rgba(207,161,79,0.1),rgba(0,0,0,0.18)_56%)]">
      <div className="border-b border-white/10 p-3.5">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-brand">
          <Sparkles className="h-3.5 w-3.5" />
          {card.eyebrow}
        </p>
        <h3 className="mt-2 text-base font-black leading-6 text-white">{card.title}</h3>
        <p className="mt-1 text-xs leading-5 text-white/55">{card.summary}</p>
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
                  selected ? "border-brand/60 bg-brand/12 shadow-[inset_3px_0_0_rgb(var(--brand))]" : "border-white/10 bg-white/[0.025] hover:border-white/20"
                }`}
              >
                {content}
              </button>
            ) : (
              <div key={candidateId} className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                {content}
              </div>
            );
          })}
        </div>
      ) : null}

      <ArtifactMeta meta={card.meta} locale={locale} showHref={!pending || saved} />

      {pending ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={saving || saved || (selectable && selection === undefined)}
            className="btn-primary min-h-10 px-4 text-xs disabled:opacity-45"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
            {saved
              ? (zh ? "已确认并保存" : "Confirmed")
              : error
                ? (zh ? "重试确认" : "Retry confirmation")
                : confirmationLabel(card.kind, zh)}
          </button>
          {saved && auditId ? (
            <button
              type="button"
              onClick={() => void undo()}
              disabled={saving}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/12 px-3 text-xs font-bold text-white/55 hover:border-brand/35 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {zh ? "撤销" : "Undo"}
            </button>
          ) : null}
          {selectable && selection === undefined && !saved ? (
            <span className="text-[11px] text-white/35">{zh ? "先选择一个候选" : "Choose one candidate first"}</span>
          ) : null}
        </div>
      ) : null}
      {completionReceipt ? (
        <section className="border-t border-positive/20 bg-positive/[0.04] p-3" aria-label={zh ? "本轮复盘回执" : "Review completion receipt"}>
          <p className="flex items-center gap-1.5 text-xs font-bold text-positive">
            <Check className="h-3.5 w-3.5" />
            {zh ? "本轮真实表现复盘已保存" : "Performance review saved"}
          </p>
          <p className="mt-1 text-xs leading-5 text-white/70">{completionReceipt.summary}</p>
          {completionReceipt.evidence ? <p className="mt-1 text-[11px] leading-4 text-white/45">{completionReceipt.evidence}</p> : null}
          {completionReceipt.primaryMetric ? <p className="mt-2 text-[11px] font-bold text-brand">{zh ? "下一轮只看：" : "Next metric: "}{completionReceipt.primaryMetric}</p> : null}
          <Link href={completionReceipt.nextAction.href} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline">
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
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold leading-5 text-white/88">{title}</p>
        {detail ? <p className="mt-0.5 text-[11px] leading-4 text-white/45">{detail}</p> : null}
      </div>
      {score !== null ? (
        <span className="shrink-0 rounded-md border border-brand/25 bg-brand/10 px-2 py-1 text-xs font-black text-brand">{score}</span>
      ) : null}
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
  if (labels.length === 0 && !targetMetric) return null;
  return (
    <div className="border-t border-white/10 px-3 py-2.5 text-[11px] leading-5 text-white/42">
      {targetMetric ? (
        <p className="flex items-center gap-1.5 font-bold text-brand">
          <BarChart3 className="h-3.5 w-3.5" />
          {locale === "zh" ? "唯一主指标：" : "Primary metric: "}{targetMetric}
        </p>
      ) : null}
      {labels.map((item) => <p key={item}>· {item}</p>)}
      {showHref && typeof meta.href === "string" ? (
        <Link href={meta.href} className="mt-1 inline-flex items-center gap-1 font-bold text-brand hover:underline">
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
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}
