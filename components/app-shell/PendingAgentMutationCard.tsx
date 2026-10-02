"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, RefreshCw, ShieldCheck } from "@/components/ui/icons";
import { CreatorStyleProfileCard } from "@/components/app-shell/CreatorStyleProfileCard";
import { consumeSSEStream } from "@/lib/sse-client";
import { creatorStyleProfileSchema } from "@/lib/agent/style-profile-schema";

/**
 * Confirmation card for pending Agent mutations, shared by the full-page
 * conversation and the side rail. When the confirmed action carries a
 * `generationRequest`, the card immediately drives the workbench generation
 * API so the user never has to leave the chat to start creation.
 */
export function PendingAgentMutationCard({
  result,
  locale
}: {
  result: Record<string, unknown>;
  locale: "zh" | "en";
}) {
  const pending = result.pendingAction && typeof result.pendingAction === "object"
    ? result.pendingAction as { id?: string; toolName?: string; args?: Record<string, unknown> }
    : null;
  const [confirming, setConfirming] = useState(false);
  const [confirmedResult, setConfirmedResult] = useState<Record<string, unknown> | null>(null);
  const [undone, setUndone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingPackage, setGeneratingPackage] = useState(false);
  const [packageQueued, setPackageQueued] = useState(false);
  const [savedPackage, setSavedPackage] = useState<{ id: string; outputCount: number } | null>(null);
  const [packageError, setPackageError] = useState<string | null>(null);
  const zh = locale === "zh";

  async function generateContentPackage(generationRequest: Record<string, unknown>) {
    setGeneratingPackage(true);
    setPackageQueued(false);
    setSavedPackage(null);
    setPackageError(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify(generationRequest)
      });
      if (!response.ok) {
        const initial = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(initial?.error ?? "Unable to generate this content package.");
      }

      let streamError: string | null = null;
      await consumeSSEStream(response, (event, data) => {
        if (event === "queued") {
          setPackageQueued(true);
          return;
        }
        if (event === "done") {
          const kit = (data as { kit?: { id?: unknown; outputs?: unknown[] } }).kit;
          if (kit && typeof kit.id === "string") {
            setPackageQueued(false);
            setSavedPackage({ id: kit.id, outputCount: Array.isArray(kit.outputs) ? kit.outputs.length : 0 });
          }
          return;
        }
        if (event === "error") {
          streamError = (data as { error?: string }).error ?? "Unable to generate this content package.";
        }
      });
      if (streamError) throw new Error(streamError);
    } catch (caught) {
      setPackageError(caught instanceof Error ? caught.message : "Unable to generate this content package.");
    } finally {
      setGeneratingPackage(false);
    }
  }

  async function confirm() {
    if (!pending?.id) return;
    setConfirming(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent/actions/${pending.id}/confirm`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        executed?: boolean;
        result?: Record<string, unknown>;
        error?: string;
      };
      if (!response.ok || !data.executed) throw new Error(data.error ?? "Unable to confirm this Agent change.");
      const confirmed = data.result ?? {};
      setConfirmedResult(confirmed);
      const generationRequest = recordValue(confirmed.generationRequest);
      if (generationRequest) await generateContentPackage(generationRequest);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to confirm this Agent change.");
    } finally {
      setConfirming(false);
    }
  }

  async function undo() {
    const auditId = confirmedResult && typeof confirmedResult.auditId === "string"
      ? confirmedResult.auditId
      : null;
    if (!auditId) return;
    setConfirming(true);
    setError(null);
    try {
      const response = await fetch(`/api/agent/actions/${auditId}/undo`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { undone?: boolean; error?: string };
      if (!response.ok || !data.undone) throw new Error(data.error ?? "Undo failed.");
      setUndone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Undo failed.");
    } finally {
      setConfirming(false);
    }
  }

  if (!pending?.id) return null;
  const workbenchUrl = confirmedResult && typeof confirmedResult.workbenchUrl === "string"
    ? confirmedResult.workbenchUrl
    : null;
  const generationRequest = confirmedResult ? recordValue(confirmedResult.generationRequest) : null;
  const isContentPackageWorkflow = Boolean(generationRequest);
  const contentPackagePreview = !confirmedResult && pending?.toolName === "prepare_platform_content_package"
    ? contentPackagePreviewValue(pending.args)
    : null;
  const creatorStylePreview = pending?.toolName === "save_creator_style_profile"
    ? creatorStyleProfileSchema.safeParse(pending.args?.profile)
    : null;
  const researchPreview = pending?.toolName === "run_evidence_research"
    ? researchMissionPreviewValue(pending.args)
    : null;
  const completedResearch = confirmedResult ? recordValue(confirmedResult.researchMission) : null;
  return (
    <div className="mt-3 rounded-lg border border-action/25 bg-action/[0.06] p-3">
      <p className="text-xs font-bold text-fg">
        {undone
          ? (zh ? "更改已撤销" : "Change undone")
          : confirmedResult
          ? (zh ? "更改已确认并执行" : "Change confirmed and applied")
          : (zh ? "等待你确认" : "Waiting for confirmation")}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-fg-muted">
        {undone
          ? (zh ? "本次更改已恢复到执行前状态。" : "This change has been restored to its previous state.")
          : confirmedResult
            ? (zh ? "服务端已校验并记录这次操作。" : "The server validated and recorded this action.")
          : (zh ? "Finfold智能体尚未写入任何内容。点击确认后才会执行。" : "The Agent has not written anything. The change runs only after confirmation.")}
      </p>
      {!confirmedResult && pending.toolName === "update_brand_brain" ? (
        <p className="mt-2 text-[11px] leading-5 text-action/90">
          {zh ? `值得记住吗：${describeBrandMemoryUpdate(pending.args, locale)}` : `Worth remembering: ${describeBrandMemoryUpdate(pending.args, locale)}`}
        </p>
      ) : null}
      {creatorStylePreview?.success ? (
        <CreatorStyleProfileCard
          profile={creatorStylePreview.data}
          locale={locale}
          variant="surface"
          compact
        />
      ) : null}
      {researchPreview ? <ResearchMissionPreview preview={researchPreview} locale={locale} /> : null}
      {completedResearch ? <CompletedResearchSummary mission={completedResearch} locale={locale} /> : null}
      {contentPackagePreview ? <ContentPackagePreview preview={contentPackagePreview} locale={locale} /> : null}
      {confirmedResult ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {workbenchUrl ? (
            <Link href={workbenchUrl} className="inline-flex items-center gap-1.5 text-xs font-bold text-action hover:underline">
              {zh ? "带着任务去创作台" : "Execute in Workbench"}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
          {!undone && typeof confirmedResult.auditId === "string" ? (
            <button
              type="button"
              onClick={() => void undo()}
              disabled={confirming}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-fg-muted hover:text-fg"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {zh ? "撤销" : "Undo"}
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={confirming}
          className="focus-ring mt-3 inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-action/55 bg-action px-3 text-xs font-bold text-on-action transition hover:bg-action-strong disabled:opacity-50"
        >
          {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {zh ? "确认执行" : "Confirm"}
        </button>
      )}
      {confirmedResult && isContentPackageWorkflow ? (
        <div className="mt-3 border-t border-hairline pt-3">
          {generatingPackage ? (
            <p className="flex items-center gap-2 text-xs text-fg-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-action" />
              {zh ? "正在生成内容包，Credits 将由现有生成流程结算。" : "Generating the content package through the existing Credits workflow."}
            </p>
          ) : null}
          {packageQueued ? (
            <p className="text-xs leading-5 text-fg-muted">
              {zh ? "内容包已进入生成队列。保存后会出现在内容库。" : "The content package is queued and will appear in the Content Library after it is saved."}
            </p>
          ) : null}
          {savedPackage ? (
            <div>
              <p className="text-xs leading-5 text-positive">
                {zh ? `内容包已保存，包含 ${savedPackage.outputCount} 条可编辑输出；尚未对外发布。` : `Content package saved with ${savedPackage.outputCount} editable output${savedPackage.outputCount === 1 ? "" : "s"}. It has not been published.`}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <Link href={`/kits/${savedPackage.id}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-action hover:underline">
                  {zh ? "打开内容包" : "Open content package"}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <Link href="/packages" className="inline-flex items-center gap-1.5 text-xs font-bold text-fg-muted transition hover:text-action hover:underline">
                  {zh ? "去内容库查看全部" : "View content library"}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ) : null}
          {packageError && generationRequest ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-risk">{packageError}</p>
              <button
                type="button"
                onClick={() => void generateContentPackage(generationRequest)}
                disabled={generatingPackage}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-action hover:underline disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {zh ? "重试生成" : "Retry generation"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-risk">{error}</p> : null}
    </div>
  );
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

type ContentPackagePreviewValue = {
  platform: "wechat" | "x";
  ideaText: string;
  goal: string;
  persona: string;
};

function contentPackagePreviewValue(args: Record<string, unknown> | undefined): ContentPackagePreviewValue | null {
  if (!args || (args.platform !== "wechat" && args.platform !== "x")) return null;
  const ideaText = typeof args.ideaText === "string" ? args.ideaText.trim() : "";
  const goal = typeof args.goal === "string" ? args.goal.trim() : "";
  const persona = typeof args.persona === "string" ? args.persona.trim() : "";
  return ideaText && goal && persona ? { platform: args.platform, ideaText, goal, persona } : null;
}

function ContentPackagePreview({
  preview,
  locale
}: {
  preview: ContentPackagePreviewValue;
  locale: "zh" | "en";
}) {
  const zh = locale === "zh";
  const platformLabel = preview.platform === "wechat" ? (zh ? "公众号" : "WeChat") : "X";
  const deliverables = preview.platform === "wechat"
    ? (zh ? "长文结构、Markdown/HTML、封面摘要与发布交接包" : "long-form structure, Markdown/HTML, cover summary, and publishing handoff")
    : (zh ? "编号线程、媒体位置与发布交接包" : "numbered thread, media placements, and publishing handoff");
  return (
    <div className="mt-3 border-l-2 border-action/70 bg-surface-2/55 px-3 py-2.5">
      <p className="text-xs font-bold text-fg">{zh ? `${platformLabel} 内容包预览` : `${platformLabel} content package preview`}</p>
      <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-fg-muted">{preview.ideaText}</p>
      <p className="mt-2 text-[11px] leading-5 text-fg-muted">{zh ? `将生成：${deliverables}` : `Will generate: ${deliverables}`}</p>
      <p className="text-[11px] leading-5 text-fg-subtle">{zh ? `目标 ${preview.goal} · 受众 ${preview.persona}` : `Goal ${preview.goal} · Audience ${preview.persona}`}</p>
    </div>
  );
}

type ResearchMissionPreviewValue = {
  missionType: "category_opportunity" | "product_competitor";
  title: string;
  question: string;
  evidenceCount: number;
};

function researchMissionPreviewValue(args: Record<string, unknown> | undefined): ResearchMissionPreviewValue | null {
  if (!args || (args.missionType !== "category_opportunity" && args.missionType !== "product_competitor")) return null;
  const title = typeof args.title === "string" ? args.title.trim() : "";
  const question = typeof args.question === "string" ? args.question.trim() : "";
  const evidenceCount = Array.isArray(args.evidence) ? args.evidence.length : 0;
  return title && question && evidenceCount > 0
    ? { missionType: args.missionType, title, question, evidenceCount }
    : null;
}

function ResearchMissionPreview({ preview, locale }: { preview: ResearchMissionPreviewValue; locale: "zh" | "en" }) {
  const zh = locale === "zh";
  return (
    <div className="mt-3 rounded-lg border border-action/20 bg-surface-2/55 p-3">
      <p className="text-[11px] font-black uppercase tracking-wider text-action">
        {preview.missionType === "category_opportunity"
          ? (zh ? "品类机会研究" : "Category opportunity research")
          : (zh ? "竞品研究" : "Competitor research")}
      </p>
      <p className="mt-1 text-xs font-bold text-fg">{preview.title}</p>
      <p className="mt-1 text-[11px] leading-5 text-fg-muted">{preview.question}</p>
      <p className="mt-2 text-[10px] font-bold text-fg-subtle">
        {zh ? `${preview.evidenceCount} 条真实证据 · 确认后才生成并结算 Credits` : `${preview.evidenceCount} evidence items · generated and billed only after confirmation`}
      </p>
    </div>
  );
}

function CompletedResearchSummary({ mission, locale }: { mission: Record<string, unknown>; locale: "zh" | "en" }) {
  const decision = recordValue(mission.decision);
  const summary = typeof decision?.executiveSummary === "string" ? decision.executiveSummary : "";
  if (!summary) return null;
  return (
    <div className="mt-3 border-l-2 border-positive/70 bg-positive/[0.045] px-3 py-2.5">
      <p className="text-xs font-bold text-positive">{locale === "zh" ? "研究决策已生成" : "Research decision ready"}</p>
      <p className="mt-1 text-[11px] leading-5 text-fg-muted">{summary}</p>
    </div>
  );
}

export function describeBrandMemoryUpdate(args: Record<string, unknown> | undefined, locale: "zh" | "en"): string {
  if (!args) return "";
  const fields: Array<[string, string]> = locale === "en" ? [
    ["toneKeywords", "Tone words"],
    ["bannedPhrases", "Words to avoid"],
    ["approvedExamples", "Approved examples"],
    ["positioningStatement", "Positioning"],
    ["targetAudience", "Audience"]
  ] : [
    ["toneKeywords", "语气关键词"],
    ["bannedPhrases", "禁用表达"],
    ["approvedExamples", "认可范文"],
    ["positioningStatement", "定位"],
    ["targetAudience", "受众"]
  ];
  const updates = fields.flatMap(([key, label]) => {
    const value = args[key];
    if (Array.isArray(value)) {
      const entries = value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 2);
      return entries.length > 0 ? [`${label}：${entries.join("、")}`] : [];
    }
    return typeof value === "string" && value.trim() ? [`${label}：${value.trim().slice(0, 80)}`] : [];
  });
  return updates.join(locale === "en" ? "; " : "；") || (locale === "en" ? "Brand Memory update" : "品牌记忆更新");
}
