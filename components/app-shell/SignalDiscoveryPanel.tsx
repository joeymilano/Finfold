"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DiscoveryStatus } from "@/lib/signals/contracts";
import { ACTION_CREDITS } from "@/lib/payment/types";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";

export function SignalDiscoveryPanel({ locale, onCompleted }: { locale: "zh" | "en"; onCompleted?: () => void }) {
  const en = locale === "en";
  const [data, setData] = useState<DiscoveryStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userDisabled, setUserDisabled] = useState<boolean | null>(null);
  const completion = useRef<string | null>(null);
  const completedCallback = useRef(onCompleted); completedCallback.current = onCompleted;
  const load = useCallback(async () => {
    const response = await fetch("/api/operations/signals", { cache: "no-store" });
    if (!response.ok) throw new Error("discovery_unavailable");
    const result = await response.json() as DiscoveryStatus;
    if (!result || !Array.isArray(result.sources) || !Array.isArray(result.candidates) || typeof result.status !== "string") {
      throw new Error("discovery_invalid_response");
    }
    setError(null);
    setData(result);
    if (result.id && ["completed", "partial"].includes(result.status) && completion.current !== result.id) {
      completion.current = result.id; completedCallback.current?.();
    }
  }, []);
  useEffect(() => { void load().catch(() => setError("unavailable")); }, [load]);
  useEffect(() => {
    if (!data || !["queued", "running"].includes(data.status)) return;
    const timer = setTimeout(() => { void load().catch(() => setError("unavailable")); }, 10000);
    return () => clearTimeout(timer);
  }, [data, load]);
  async function refresh() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/operations/signals", { method: "POST" });
      if (!response.ok) { setError(response.status === 402 ? "credits" : response.status === 403 ? "plan" : response.status === 422 ? "profile" : "unavailable"); return; }
      await load();
    } catch { setError("unavailable"); } finally { setBusy(false); }
  }
  async function toggleEnabled(next: boolean) {
    const previous = userDisabled ?? data?.userDisabled ?? false;
    setUserDisabled(next); setError(null);
    try {
      const response = await fetch("/api/settings/signal-discovery", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: next }) });
      if (!response.ok) throw new Error("toggle_failed");
    } catch { setUserDisabled(previous); setError("unavailable"); }
  }
  if (data?.status === "disabled") return null;
  const labels: Record<string, string> = en ? {
    pending: "Not checked yet", available: "Indexed sources found", no_results: "No matching source", not_configured: "Not configured", failed: "Retrieval failed", budget_exhausted: "Not enough Credits"
  } : { pending: "尚未检索", available: "已找到索引来源", no_results: "本轮无匹配来源", not_configured: "尚未配置", failed: "获取失败", budget_exhausted: "Credits 不足" };
  const status = data?.status;
  const running = status === "queued" || status === "running";
  const off = userDisabled ?? data?.userDisabled ?? false;
  const insufficient = data?.insufficientCredits === true;
  const searchCost = ACTION_CREDITS.signalDiscoverySearch, analysisCost = ACTION_CREDITS.signalDiscoveryAnalysis;
  const estimatedRunCost = searchCost * 8 + analysisCost * 12;
  const billingLine = en
    ? `Public sources first, billed to your plan Credits: ${searchCost} per search, ${analysisCost} per source analysis, up to ${estimatedRunCost} for a full run.`
    : `优先使用公开来源，按套餐 Credits 计费：检索 ${searchCost}/次 · 原文分析 ${analysisCost}/次，完整一轮最多约 ${estimatedRunCost}。`;
  const topUp = en ? <a className="text-action underline" href="/billing">Upgrade or buy a Credit pack</a> : <a className="text-action underline" href="/billing">升级或购买 Credits 补充包</a>;
  const stuckMinutes = running && data?.updatedAt ? Math.floor((Date.now() - Date.parse(data.updatedAt)) / 60000) : 0;
  return <section aria-label={en ? "Business signal discovery" : "业务信号发现"} className="mt-5 rounded-2xl border border-hairline bg-bg/40 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-sm font-bold">{en ? "Find opportunities for your business" : "围绕你的业务，主动找机会"}</h3>
        <p role="status" className="mt-1 text-xs leading-5 text-fg-muted">{off ? en ? "Turned off. Turn it on to search public sources for your business, billed to your plan Credits." : "已关闭。开启后将围绕你的业务主动检索公开来源，按套餐 Credits 计费。" : running ? en ? "Searching and checking original sources in the background." : "正在后台搜索并核对原文，可以离开页面稍后查看。" : insufficient ? en ? <>Your plan Credits are running low ({data?.credits?.available ?? 0} left). {topUp} to keep discovery running.</> : <>套餐 Credits 不足（剩余 {data?.credits?.available ?? 0}），{topUp}后即可继续使用。</> : data?.error === "model_not_configured" ? en ? "Search and analysis channels are not configured." : "搜索与分析通道尚未配置，已保留免费来源候选。" : data?.error === "budget_exhausted" || data?.error === "insufficient_credits" ? en ? <>The last run stopped early because plan Credits ran out. {topUp} and start again.</> : <>上一轮因套餐 Credits 不足中断，{topUp}后可重新发起。</> : data?.error === "no_qualified_signals" ? en ? "No evidence met the recommendation criteria this round." : "本轮没有达到推荐标准的证据，可展开查看候选与原因。" : status === "cancelled" ? data?.error === "profile_changed" ? en ? "Your business profile changed, so this run was cancelled. Start it again." : "业务资料已更新，本轮已取消，请重新发起发现。" : data?.error === "access_changed" ? en ? "Discovery was turned off or plan access changed, so this run was cancelled." : "信号发现已关闭或套餐权限变化，本轮已取消，可重新发起。" : en ? "This run was cancelled. Start it again." : "本轮发现已取消，可重新发起。" : status === "failed" ? en ? "Discovery could not finish. Existing sources remain available." : "本轮发现未能完成，已有来源仍可查看。" : billingLine}</p>
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={!off} onCheckedChange={checked => void toggleEnabled(checked)} label={en ? "Automatic discovery" : "自动发现"} />
        <Button size="sm" variant="secondary" loading={busy} disabled={running || off || insufficient} onClick={() => void refresh()}>{en ? "Find signals" : "发现业务信号"}</Button>
      </div>
    </div>
    {error ? <p role="alert" className="mt-2 text-xs text-risk">{error === "profile" ? en ? "Add your business or watch keywords first." : "请先补充业务介绍或关注关键词。" : error === "plan" ? en ? "Business discovery requires an Agent plan." : "当前方案未包含业务自动发现。" : error === "credits" ? en ? "Not enough plan Credits. Upgrade or buy a pack first." : "套餐 Credits 不足，请先升级或购买补充包。" : en ? "Unable to load discovery. Try again shortly." : "暂时无法获取发现结果，请稍后重试。"}</p> : null}
    {!off && data?.id ? <p className="mt-3 text-xs text-fg-muted">{en ? `${data.searchCalls}/8 searches · ${data.readCount}/12 source checks · ${data.recommended} recommendations` : `检索 ${data.searchCalls}/8 次 · 原文核对 ${data.readCount}/12 篇 · 推荐 ${data.recommended} 条`}</p> : null}
    {!off && (data?.prescreen?.skipped ?? 0) > 0 && data?.prescreen ? (() => {
      const p = data.prescreen;
      return <p className="mt-1 text-xs text-fg-muted">{en
        ? `Auto prescreen filtered ${p.skipped} irrelevant candidates and saved ${p.savedCredits} credits, keeping the analysis quota for relevant sources.`
        : `预筛过滤 ${p.skipped} 条不相关候选，省 ${p.savedCredits} credits，分析配额留给了相关内容。`}</p>;
    })() : null}
    {!off && stuckMinutes >= 5 ? <p className="mt-1 text-xs text-fg-muted">{en ? `Queued for ${stuckMinutes} minutes without progress; heavy load can delay processing.` : `已排队 ${stuckMinutes} 分钟未推进，高峰期处理可能延迟，可稍后再查看。`}</p> : null}
    {!off && data?.sources.length ? <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold">{en ? "Platform coverage" : "查看各平台覆盖"}</summary><ul className="mt-2 grid gap-2 sm:grid-cols-2">{data.sources.map(s => <li key={s.platform}>{s.label}：{labels[s.status]}{s.found ? ` · ${s.found}` : ""}</li>)}</ul><p className="mt-2 text-fg-muted">{en ? "Search index coverage does not mean complete access to platform posts or comments." : "索引检索不代表已完整读取平台帖子或评论，推荐还需要原文核对。"}</p></details> : null}
    {!off && data?.candidates.length ? <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold">{en ? "Candidates and evidence" : "查看候选与证据"} · {data.candidates.length}</summary><ul className="mt-3 space-y-3">{data.candidates.map(c => <li key={c.url} className="border-t border-hairline pt-2"><a className="font-semibold text-action underline" href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a><p className="mt-1 text-fg-muted">{c.sourceLabel} · {c.publishedAt ? new Date(c.publishedAt).toLocaleDateString(en ? "en-US" : "zh-CN") : en ? "Publication date unknown" : "发布时间未知"}</p>{c.excerpt ? <blockquote className="mt-2 border-l-2 border-hairline pl-2">{c.excerpt}</blockquote> : null}<p className="mt-1 leading-5">{c.reason ?? (en ? "Awaiting original-source verification." : "等待核对原文。")}</p></li>)}</ul></details> : null}
  </section>;
}
