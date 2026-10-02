"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Check, Loader2, Sparkles, X } from "@/components/ui/icons";
import { consumeSSEStream } from "@/lib/sse-client";
import { captureEvent } from "@/lib/posthog";
import type { GenerateRequest } from "@/lib/content-schema";
import type { TopicOpportunity } from "@/lib/trends/types";
import {
  opportunityFormat,
  opportunityMainAngle,
  opportunityTitle
} from "@/lib/trends/display";
import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/cn";

type PrepareResponse = {
  status?: "confirmed" | "ready";
  replayed?: boolean;
  contentKitId?: string;
  idempotencyKey?: string;
  generationRequest?: GenerateRequest;
  error?: string;
};

export function OpportunityPrepareButton({
  opportunity,
  compact = false
}: {
  opportunity: TopicOpportunity;
  compact?: boolean;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "preparing" | "generating" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const existingKitId = opportunity.contentKitId;
  const busy = status === "preparing" || status === "generating";

  async function prepare() {
    if (existingKitId) {
      router.push(`/kits/${existingKitId}`);
      return;
    }
    const idempotencyKey = crypto.randomUUID();
    setStatus("preparing");
    setMessage(null);
    captureEvent("opportunity_prepare_confirmed", {
      opportunity_id: opportunity.id,
      match_score: opportunity.matchScore,
      platform: opportunity.recommendedPlatform
    });
    try {
      const prepareResponse = await fetch(`/api/operations/topic-opportunities/${encodeURIComponent(opportunity.id)}/prepare`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey }
      });
      const prepared = await prepareResponse.json() as PrepareResponse;
      if (!prepareResponse.ok) throw new Error(prepared.error || localized(locale, "暂时无法确认这个机会。", "Unable to confirm this opportunity."));
      if (prepared.status === "ready" && prepared.contentKitId) {
        router.push(`/kits/${prepared.contentKitId}`);
        return;
      }
      if (!prepared.generationRequest) throw new Error(localized(locale, "生成请求没有准备完成。", "The generation request was not prepared."));

      setStatus("generating");
      setMessage(localized(locale, "智能体正在生成草稿，不会自动发布。", "Agent is creating a draft. Nothing will be published automatically."));
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": prepared.idempotencyKey || idempotencyKey,
          "x-finfold-force-regenerate": "1"
        },
        body: JSON.stringify(prepared.generationRequest)
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || localized(locale, "草稿生成失败。", "Draft generation failed."));
      }

      let contentKitId: string | null = null;
      let generationRunId: string | null = null;
      let queued = false;
      let streamError: string | null = null;
      await consumeSSEStream(response, (event, data) => {
        const payload = data as Record<string, unknown>;
        if (event === "run") generationRunId = String((payload.run as { id?: string } | undefined)?.id ?? "") || null;
        if (event === "queued") queued = true;
        if (event === "done") contentKitId = String((payload.kit as { id?: string } | undefined)?.id ?? "") || null;
        if (event === "duplicate") contentKitId = String(payload.contentKitId ?? "") || null;
        if (event === "error") streamError = String(payload.error ?? localized(locale, "草稿生成失败。", "Draft generation failed."));
      });
      if (streamError) throw new Error(streamError);
      if (!contentKitId && queued) contentKitId = await waitForOpportunityKit(opportunity.id);
      if (contentKitId) {
        captureEvent("opportunity_kit_completed", {
          opportunity_id: opportunity.id,
          content_kit_id: contentKitId,
          generation_run_id: generationRunId
        });
        router.push(`/kits/${contentKitId}`);
        return;
      }
      if (queued) {
        setOpen(false);
        setMessage(localized(locale, "草稿已进入后台队列，完成后会出现在内容库。", "The draft is queued and will appear in Content Library when ready."));
        router.push("/packages");
        return;
      }
      throw new Error(localized(locale, "没有收到完整的草稿结果。", "No completed draft was returned."));
    } catch (error) {
      void fetch(`/api/operations/topic-opportunities/${encodeURIComponent(opportunity.id)}/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ outcome: "failed" })
      }).catch(() => undefined);
      setStatus("error");
      setMessage(error instanceof Error ? error.message : localized(locale, "草稿生成失败。", "Draft generation failed."));
      captureEvent("opportunity_prepare_failed", { opportunity_id: opportunity.id });
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => existingKitId ? router.push(`/kits/${existingKitId}`) : setOpen(true)}
        className={cn(
          "focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-action font-black text-on-action shadow-[0_12px_34px_rgb(var(--action)/0.18)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-wait disabled:opacity-60",
          compact ? "h-9 px-3 text-[11px]" : "h-11 px-4 text-xs"
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : existingKitId ? <Check className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        {existingKitId
          ? localized(locale, "打开草稿", "Open draft")
          : busy
            ? localized(locale, "准备中", "Preparing")
            : localized(locale, "让智能体准备", "Ask Agent to prepare")}
      </button>
      {message && !open ? <p aria-live="polite" className="mt-2 max-w-sm text-[11px] leading-5 text-fg-muted">{message}</p> : null}

      <AnimatePresence>
        {open ? (
          <motion.div
            className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="opportunity-confirm-title"
              className="relative w-full max-w-lg overflow-hidden rounded-[24px] border border-hairline bg-surface p-5 shadow-2xl sm:p-6"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
            >
              <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-action/10 blur-3xl" />
              <button type="button" disabled={busy} onClick={() => setOpen(false)} aria-label={localized(locale, "关闭", "Close")} className="focus-ring absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"><X className="h-4 w-4" /></button>
              <div className="relative">
                <div className="grid h-11 w-11 place-items-center rounded-2xl border border-action/20 bg-action/10 text-action"><Sparkles className="h-5 w-5" /></div>
                <p className="mt-5 text-[10px] font-black tracking-[0.2em] text-action">{localized(locale, "确认生成草稿", "CONFIRM DRAFT")}</p>
                <h2 id="opportunity-confirm-title" className="mt-2 pr-8 text-xl font-black tracking-[-0.025em] text-fg">{opportunityTitle(opportunity, locale)}</h2>
                <p className="mt-3 text-sm leading-6 text-fg-muted">{opportunityMainAngle(opportunity, locale)}</p>
                <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-hairline bg-surface-2/55 p-3 text-xs">
                  <div><p className="text-[10px] font-bold text-fg-subtle">{localized(locale, "匹配度", "MATCH")}</p><p className="mt-1 font-black text-action">{opportunity.matchScore}</p></div>
                  <div><p className="text-[10px] font-bold text-fg-subtle">{localized(locale, "输出", "OUTPUT")}</p><p className="mt-1 font-black text-fg">{opportunityFormat(opportunity, locale)}</p></div>
                </div>
                <p className="mt-4 text-[11px] leading-5 text-fg-subtle">{localized(locale, "确认后会消耗相应创作点数生成草稿；不会自动发布，发布仍需你单独确认。", "Confirmation uses the applicable AI Credits to create a draft. Publishing always requires a separate approval.")}</p>
                {message ? <p role={status === "error" ? "alert" : "status"} className={cn("mt-4 rounded-xl border px-3 py-2 text-xs leading-5", status === "error" ? "border-risk/25 bg-risk/10 text-risk" : "border-action/20 bg-action/8 text-fg-muted")}>{message}</p> : null}
                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" disabled={busy} onClick={() => setOpen(false)} className="focus-ring h-10 rounded-xl border border-hairline px-4 text-xs font-bold text-fg-muted hover:bg-surface-2 hover:text-fg">{localized(locale, "暂不生成", "Not now")}</button>
                  <button type="button" disabled={busy} onClick={() => { void prepare(); }} className="focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-action px-4 text-xs font-black text-on-action disabled:cursor-wait disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}{status === "generating" ? localized(locale, "正在生成", "Generating") : localized(locale, "确认并生成草稿", "Confirm and generate")}</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

async function waitForOpportunityKit(opportunityId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const response = await fetch(`/api/operations/topic-opportunities/${encodeURIComponent(opportunityId)}`, { cache: "no-store" });
    if (!response.ok) continue;
    const payload = await response.json() as { opportunity?: TopicOpportunity };
    if (payload.opportunity?.contentKitId) return payload.opportunity.contentKitId;
    if (payload.opportunity?.preparationStatus === "failed") return null;
  }
  return null;
}

function localized(locale: "zh" | "en", zh: string, en: string): string {
  return locale === "en" ? en : zh;
}
