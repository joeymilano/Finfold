"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Copy, Loader2 } from "@/components/ui/icons";
import { useWorkbench } from "./WorkbenchProvider";
import { OutputBoard } from "./OutputBoard";
import { buildAuthHref } from "@/lib/auth-return";
import { captureEvent } from "@/lib/posthog";
import { computeKitCost, PLAN_CREDITS } from "@/lib/payment/types";
import { loadPendingGeneration, isGenerationRunActive } from "@/lib/generation-run-client";
import { firstTaskHref, firstTaskPlatforms, readFirstTaskDraft, saveFirstTaskDraft, type FirstTaskDraft } from "@/lib/first-task";
import { getLocalizedPlatformLabel } from "@/lib/platforms";

export function FirstTaskWorkbench({ draftId }: { draftId?: string }) {
  const router = useRouter();
  const w = useWorkbench();
  const en = w.locale === "en";
  const [draft, setDraft] = useState<FirstTaskDraft | null>(null);
  const [storageError, setStorageError] = useState(false);
  const initialized = useRef(false);
  const started = useRef(false);
  const inputStarted = useRef(false);
  const cost = computeKitCost(2);

  function captureReady(task: FirstTaskDraft, text: string, source: "restored" | "edited" | "submit") {
    if (started.current || text.trim().length < 20) return;
    started.current = true;
    captureEvent("first_task_input_ready", {
      first_task_id: task.id, platform_count: 2, input_source: source,
      first_task_ui_version: 2
    });
  }

  useEffect(() => {
    if (!w.canvasRestoreComplete || initialized.current) return;
    initialized.current = true;
    const saved = readFirstTaskDraft(draftId);
    const pending = loadPendingGeneration();
    // An in-flight generation owns the canvas, even after OAuth or a refresh.
    if (pending?.runId) {
      const restored = saved ?? {
        id: crypto.randomUUID(), text: pending.input.ideaText,
        platforms: ["xiaohongshu", "wechat"] as FirstTaskDraft["platforms"],
        locale: w.locale, savedAt: Date.now()
      };
      setDraft(restored);
      captureEvent("first_task_viewed", { first_task_id: restored.id, restored: true, first_task_ui_version: 2 });
      return;
    }
    const next: FirstTaskDraft = saved ?? {
      id: crypto.randomUUID(), text: "", platforms: en ? ["x", "linkedin"] : ["xiaohongshu", "wechat"],
      locale: w.locale, savedAt: Date.now()
    };
    if (saved?.kitId && w.activeKitId === saved.kitId) {
      setDraft(saved);
      captureEvent("first_task_viewed", { first_task_id: saved.id, restored: true, completed: true, first_task_ui_version: 2 });
      return;
    }
    w.prepareFreshDraft();
    w.setIdeaText(next.text);
    w.setSelectedPlatforms([...next.platforms]);
    w.setVisualMode("none");
    setDraft(next);
    setStorageError(!saveFirstTaskDraft(next));
    captureEvent("first_task_viewed", { first_task_id: next.id, restored: Boolean(saved), locale: w.locale, first_task_ui_version: 2 });
    if (saved) captureReady(next, next.text, "restored");
    // Initialization runs after durable canvas restore, once per entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.canvasRestoreComplete]);

  useEffect(() => {
    if (!draft || !w.activeKitId || w.outputs.length === 0 || draft.kitId === w.activeKitId) return;
    const next = { ...draft, kitId: w.activeKitId, savedAt: Date.now() };
    setDraft(next);
    saveFirstTaskDraft(next);
  }, [draft, w.activeKitId, w.outputs.length]);

  function updateDraft(text: string, platforms = draft?.platforms) {
    if (!draft || !platforms) return;
    if (w.activeKitId) { w.prepareFreshDraft(); w.setVisualMode("none"); }
    const next = { ...draft, text, platforms, kitId: undefined, savedAt: Date.now() };
    setDraft(next);
    w.setIdeaText(text);
    w.setSelectedPlatforms([...platforms]);
    setStorageError(!saveFirstTaskDraft(next));
    if (!inputStarted.current && text.trim().length > 0 && text !== draft.text) {
      inputStarted.current = true;
      captureEvent("first_task_input_started", { first_task_id: draft.id, first_task_ui_version: 2 });
    }
    captureReady(draft, text, "edited");
  }

  async function submit() {
    if (!draft || w.ideaText.trim().length < 20 || w.isLoading) return;
    captureReady(draft, w.ideaText, "submit");
    const next = { ...draft, text: w.ideaText, savedAt: Date.now() };
    const saved = saveFirstTaskDraft(next);
    setStorageError(!saved);
    if (!w.entitlement.authenticated) {
      if (!saved) return;
      captureEvent("first_task_auth_requested", { first_task_id: draft.id, return_to: firstTaskHref(draft.id) });
      router.push(buildAuthHref("/signup", firstTaskHref(draft.id)));
      return;
    }
    // Never auto-charge on authentication return. The explicit button starts the run.
    await w.generateKit();
  }

  const valid = Boolean(draft && w.ideaText.trim().length >= 20);
  const remaining = Math.max(0, 20 - w.ideaText.trim().length);
  const active = w.isLoading || Boolean(w.generationRun && isGenerationRunActive(w.generationRun));
  const insufficient = w.entitlement.authenticated && w.allowance.status === "ready" && (w.allowance.available ?? 0) < cost;
  const sessionPending = w.allowance.status === "refreshing" || !w.canvasRestoreComplete;
  return (
    <div className="mx-auto w-full max-w-5xl space-y-7 pb-20" data-testid="first-task-workbench">
      <header className="max-w-2xl pt-4 sm:pt-8">
        <p className="eyebrow-mono text-action-strong">{en ? "YOUR FIRST PUBLISHING TASK" : "今天，先完成一件事"}</p>
        <h1 className="mt-4 whitespace-pre-line text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-5xl">{en ? "One piece of content. Two posts ready to review." : "一份已有内容，\n变成两份发布稿。"}</h1>
        <p className="mt-4 text-sm leading-7 text-fg-muted sm:text-base">{en ? "Bring a product update, an article, or a real experience. Choose two platforms, review the drafts, then copy or download them." : "贴入一段产品更新、文章或真实经历。选两个平台，拿到各自的标题和正文，检查后即可复制或下载。"}</p>
      </header>
      <ol className="flex flex-wrap gap-x-7 gap-y-2 text-sm text-fg-muted" aria-label={en ? "Your task" : "任务步骤"}>
        {[en ? "Add your content" : "放入自己的内容", en ? "Create two drafts" : "生成两份草稿", en ? "Review and use" : "检查并使用"].map((label, i) => <li key={label} className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full border border-hairline text-xs">{i + 1}</span>{label}</li>)}
      </ol>
      <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-panel sm:p-8">
        <label htmlFor="first-task-source" className="text-base font-semibold text-fg">{en ? "What would you like to share?" : "这次想分享什么？"}</label>
        <p id="first-task-help" className="mb-4 mt-1 text-xs leading-5 text-fg-muted">{en ? "A few sentences are enough: what happened, who it helps, and the facts to keep. At least 20 characters." : "不用先写成文章。说清楚发生了什么、对谁有用、哪些事实要保留；至少 20 个字。"}</p>
        {!w.entitlement.authenticated ? <p className="mb-4 text-xs leading-5 text-fg-muted">{en ? "Write first, then create a free account to generate. Your draft is saved in this browser for 7 days." : "先写内容，再免费注册生成。草稿会在此浏览器保存 7 天。"}</p> : null}
        <textarea id="first-task-source" aria-describedby="first-task-help first-task-progress" value={w.ideaText} onChange={(e) => updateDraft(e.target.value)} disabled={active || !draft} maxLength={12000} rows={7} className="focus-ring w-full resize-y rounded-xl border border-hairline bg-bg p-4 text-sm leading-7 text-fg placeholder:text-fg-muted" placeholder={en ? "What did you make, learn, or change?\nWho would find it useful?\nAdd the details you want readers to remember." : "这次做了什么、学到了什么，或改进了什么？\n希望谁看到？\n补充想让读者记住的真实细节。"} />
        <p id="first-task-progress" className="mt-2 text-xs leading-5 text-fg-muted">{remaining > 0 ? (en ? `${remaining} more characters to continue.` : `再写 ${remaining} 个字，就可以继续。`) : (en ? "Ready. Choose your two platforms below." : "内容已就绪，接下来选择两个平台。")}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {[0, 1].map((index) => <label key={index} className="grid gap-2 text-xs font-semibold text-fg-muted">{en ? `Platform ${index + 1}` : `平台 ${index + 1}`}<select aria-label={en ? `Platform ${index + 1}` : `平台 ${index + 1}`} value={draft?.platforms[index] ?? ""} disabled={active || !draft} onChange={(e) => { if (!draft) return; const next = [...draft.platforms] as FirstTaskDraft["platforms"]; next[index] = e.target.value as FirstTaskDraft["platforms"][number]; updateDraft(w.ideaText, next); }} className="focus-ring min-h-11 rounded-lg border border-hairline bg-bg px-3 text-sm text-fg">{firstTaskPlatforms.map((id) => <option value={id} key={id} disabled={draft?.platforms[1 - index] === id}>{getLocalizedPlatformLabel(id, w.locale)}</option>)}</select></label>)}
        </div>
        <div className="mt-6 flex flex-col gap-4 border-t border-hairline pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs leading-6 text-fg-muted"><p className="flex items-center gap-2"><Check className="h-4 w-4 text-action-strong" />{en ? `${PLAN_CREDITS.free} monthly free Credits · ${cost} Credits for these two drafts` : `免费账户每月 ${PLAN_CREDITS.free} 点 · 本次两份文案 ${cost} 点`}</p><p className="flex items-center gap-2"><Copy className="h-4 w-4" />{en ? "Copy and download included. No card required." : "包含复制与下载，无需绑定银行卡。"}</p></div>
          <button type="button" onClick={() => void submit()} disabled={!valid || active || sessionPending || insufficient || (w.entitlement.authenticated && w.allowance.status !== "ready")} className="btn-primary min-h-12 justify-center px-6 disabled:cursor-not-allowed disabled:opacity-50">{active ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{active ? (en ? "Preparing your drafts…" : "正在准备草稿……") : w.entitlement.authenticated ? (en ? "Generate my two drafts" : "生成我的两份草稿") : (en ? "Save and create a free account" : "保存内容，免费注册后生成")}</button>
        </div>
        {storageError ? <p role="alert" className="mt-3 text-sm text-risk">{en ? "Your browser could not save this draft. Keep a copy and allow browser storage before continuing to signup." : "浏览器暂时无法保存草稿。请先复制备份，并允许浏览器存储后再前往注册。"}</p> : !w.entitlement.authenticated ? <p className="mt-3 text-xs text-fg-muted">{en ? "Your text stays in this browser for 7 days. After signup, return here to generate." : "草稿在此浏览器保留 7 天，注册后回到这里继续生成。"}</p> : null}
        {insufficient ? <p role="status" className="mt-3 text-sm text-fg-muted">{en ? "Your remaining Credits cannot cover this run." : "当前剩余点数不足以完成本次生成。"} <Link className="underline" href="/billing">{en ? "View your balance" : "查看余额"}</Link></p> : null}
        {w.allowance.status === "unavailable" ? <p role="alert" className="mt-3 text-sm text-risk">{en ? "We could not check your session and Credits. Refresh to retry; your saved text will stay here." : "暂时无法核对账户和点数，请刷新重试；已保存的内容会保留。"}</p> : null}
      </section>
      {active ? <button type="button" className="btn-ghost" onClick={() => void w.cancelGeneration()}>{en ? "Cancel this task" : "取消本次任务"}</button> : null}
      {draft?.kitId && w.activeKitId !== draft.kitId ? <Link href={`/kits/${draft.kitId}`} className="btn-secondary">{en ? "Open my saved drafts" : "打开已保存的草稿"}</Link> : null}
      {(active || w.outputs.length > 0 || w.error) ? <section aria-label={en ? "Your drafts" : "你的草稿"}><OutputBoard outputs={w.outputs} isLoading={w.isLoading} isRunActive={Boolean(w.generationRun && isGenerationRunActive(w.generationRun))} error={w.error} locale={w.locale} canUseOutputs={w.entitlement.canUseOutputs} kitId={w.activeKitId ?? undefined} platformCount={w.selectedPlatforms.length} expectedPlatforms={w.selectedPlatforms} onOutputSaved={w.onOutputSaved} /></section> : null}
      <Link href="/workbench" className="inline-flex items-center gap-2 text-sm text-fg-muted underline underline-offset-4">{en ? "Open the full workbench" : "进入完整创作台"}<ArrowRight className="h-4 w-4" /></Link>
    </div>
  );
}
