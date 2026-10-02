"use client";

import Link from "next/link";
import React, { useState } from "react";
import { ArrowUpRight, FileStack, Loader2, RefreshCw } from "@/components/ui/icons";
import type { AgentContentWorkflow } from "@/lib/agent/content-workflow";
import { consumeSSEStream } from "@/lib/sse-client";

function workflowCopy(workflow: AgentContentWorkflow, locale: "zh" | "en") {
  const zh = locale === "zh";
  const platform = workflow.platform === "wechat" ? (zh ? "公众号" : "WeChat") : "X";
  if (workflow.stage === "generating") return zh ? `${platform} 内容包生成中` : `${platform} content package is generating`;
  if (workflow.completionReceipt) return workflow.completionReceipt.summary;
  if (workflow.status === "superseded") return zh ? `${platform} 内容包已被新任务替代` : `${platform} content package was replaced by a newer task`;
  return zh ? `${platform} 内容包待生成` : `${platform} content package is ready to generate`;
}

export function AgentContentWorkflowStateCard({
  workflows,
  locale,
  onChanged
}: {
  workflows: AgentContentWorkflow[];
  locale: "zh" | "en";
  onChanged?: () => void;
}) {
  const zh = locale === "zh";
  const [retryingWorkflowId, setRetryingWorkflowId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  async function retryGeneration(workflow: AgentContentWorkflow) {
    setRetryingWorkflowId(workflow.id);
    setRetryError(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({
          ...workflow.request,
          platforms: [workflow.platform],
          mediaAssets: [],
          agentContentWorkflowId: workflow.id
        })
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Unable to retry this content package.");
      }
      let streamError: string | null = null;
      await consumeSSEStream(response, (event, data) => {
        if (event === "error") streamError = (data as { error?: string }).error ?? "Unable to retry this content package.";
      });
      if (streamError) throw new Error(streamError);
      onChanged?.();
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "Unable to retry this content package.");
    } finally {
      setRetryingWorkflowId(null);
    }
  }

  if (workflows.length === 0) return null;

  return (
    <section className="mt-5 border-y border-white/10 py-4">
      <div className="flex items-center gap-2 text-xs font-bold text-white/78">
        <FileStack className="h-3.5 w-3.5 text-action" />
        {zh ? "内容包状态" : "Content package status"}
      </div>
      <div className="mt-2 grid gap-2">
        {workflows.map((workflow) => (
          <div key={workflow.id} className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2.5">
            {workflow.stage === "generating" ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-action" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-positive" />}
            <p className="min-w-0 flex-1 text-[11px] leading-5 text-white/65">{workflowCopy(workflow, locale)}</p>
            {workflow.kitId ? (
              <Link href={`/kits/${workflow.kitId}`} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-action hover:underline">
                {zh ? "打开内容包" : "Open content package"}
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            ) : workflow.status === "active" && workflow.stage === "draft" ? (
              <button
                type="button"
                onClick={() => void retryGeneration(workflow)}
                disabled={retryingWorkflowId !== null}
                className="focus-ring inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-action hover:underline disabled:opacity-50"
              >
                {retryingWorkflowId === workflow.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {zh ? "重试生成" : "Retry generation"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {retryError ? <p role="alert" className="mt-2 text-xs text-risk">{retryError}</p> : null}
    </section>
  );
}