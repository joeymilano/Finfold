"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Loader2 } from "@/components/ui/icons";
import { captureEvent } from "@/lib/posthog";

/**
 * Action strip under an agent rewrite result: keep the copy as a draft in the
 * content library, or carry it into the workbench to build a full content
 * package. The rewritten text itself stays in the conversation — this card is
 * the bridge between the chat and the creation pipeline.
 */
export function RewriteResultCard({
  text,
  locale,
  demoMode = false
}: {
  text: string;
  locale: "zh" | "en";
  demoMode?: boolean;
}) {
  const zh = locale === "zh";
  const [saving, setSaving] = useState(false);
  const [savedKitId, setSavedKitId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workbenchHref = `/workbench?idea=${encodeURIComponent(text)}`;

  async function saveDraft() {
    if (demoMode) {
      setError(zh ? "登录后才能存入内容库" : "Log in to save drafts");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/kits/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: "agent_rewrite" })
      });
      const data = await response.json().catch(() => null) as { kitId?: string; error?: string } | null;
      if (!response.ok || !data?.kitId) {
        throw new Error(data?.error ?? (zh ? "保存失败，请重试" : "Failed to save, please retry"));
      }
      setSavedKitId(data.kitId);
      captureEvent("rewrite_draft_saved", {});
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : (zh ? "保存失败，请重试" : "Failed to save, please retry"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-action/25 bg-action/[0.06] p-3">
      {savedKitId ? (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold text-positive">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {zh ? "草稿已存入内容库" : "Draft saved to the content library"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Link
              href={`/kits/${savedKitId}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-action hover:underline"
            >
              {zh ? "打开内容包" : "Open content package"}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/packages"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-fg-muted transition hover:text-action hover:underline"
            >
              {zh ? "去内容库查看全部" : "View content library"}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={saving}
            className="focus-ring inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-action/55 bg-action px-3 text-xs font-bold text-on-action transition hover:bg-action-strong disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {zh ? "存入内容库" : "Save to content library"}
          </button>
          <Link
            href={workbenchHref}
            onClick={() => captureEvent("rewrite_open_workbench", {})}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-action hover:underline"
          >
            {zh ? "去创作台深化" : "Develop in Workbench"}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
      {error ? <p className="mt-2 text-xs text-risk">{error}</p> : null}
    </div>
  );
}
