"use client";

import { Check, Copy, Download, FileText, Loader2, Heart, MessageCircle, Star, Share2, MoreHorizontal, MessageSquare, ThumbsUp, Send, Globe, Sparkles, Eye, Code, Repeat2, ArrowBigUp, ArrowBigDown, ChevronUp, Bookmark, Award } from "lucide-react";
import { useState, useEffect } from "react";
import type { KitOutput } from "@/lib/content-schema";
import { dashboardCopy, type Locale } from "@/lib/i18n";
import { getPlatform } from "@/lib/platforms";

type OutputBoardProps = {
  outputs: KitOutput[];
  isLoading: boolean;
  error: string | null;
  locale: Locale;
  canUseOutputs?: boolean;
  onLockedAction?: (reason: "copy" | "export" | "save" | "analyze" | "iterate") => void;
};

export function OutputBoard({ outputs, isLoading, error, locale, canUseOutputs = true, onLockedAction }: OutputBoardProps) {
  const copy = dashboardCopy[locale];
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  
  // Track preview mode per platform. "preview" for High-Fi Social view, "raw" for content block views.
  const [viewModes, setViewModes] = useState<Record<string, "preview" | "raw">>({});

  // Cycle through checking steps when loading
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setLoadingStepIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setLoadingStepIndex((prev) => {
        if (prev < 3) return prev + 1;
        return prev;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [isLoading]);

  async function copyOutput(output: KitOutput) {
    if (!canUseOutputs) {
      onLockedAction?.("copy");
      return;
    }

    const platform = getPlatform(output.platform);
    const text = formatOutput(output, platform.label);
    await navigator.clipboard.writeText(text);
    setCopiedPlatform(output.platform);
    window.setTimeout(() => setCopiedPlatform(null), 1600);
  }

  async function copyAll() {
    if (!canUseOutputs) {
      onLockedAction?.("copy");
      return;
    }

    await navigator.clipboard.writeText(formatAllOutputs(outputs));
    setCopiedAll(true);
    window.setTimeout(() => setCopiedAll(false), 1600);
  }

  function downloadMarkdown() {
    if (!canUseOutputs) {
      onLockedAction?.("export");
      return;
    }

    const blob = new Blob([formatAllOutputs(outputs)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `finfold-content-kit-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const toggleViewMode = (platformId: string) => {
    setViewModes((prev) => ({
      ...prev,
      [platformId]: prev[platformId] === "raw" ? "preview" : "raw",
    }));
  };

  return (
    <section className="panel workbench-scroll min-h-[680px] p-5 xl:h-[min(860px,calc(100vh-128px))] xl:overflow-y-auto xl:pr-4">
      <div className="mb-5 flex flex-col gap-3 border-b border-hairline pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-fg text-[11px] font-bold text-bg">3</span>
          <FileText className="h-4 w-4 text-fg" />
          <h2 className="text-sm font-semibold text-fg">{copy.outputStep}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {outputs.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => void copyAll()}
                className="btn-ghost focus-ring px-3 py-1.5 text-xs"
              >
                {copiedAll ? <Check className="h-3.5 w-3.5 text-brand" /> : <Copy className="h-3.5 w-3.5 text-fg-muted" />}
                {!canUseOutputs ? copy.unlockToCopy : copiedAll ? copy.copiedKit : copy.copyAll}
              </button>
              <button
                type="button"
                onClick={downloadMarkdown}
                className="btn-primary focus-ring px-3 py-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                {!canUseOutputs ? copy.unlockToExport : copy.markdown}
              </button>
            </>
          ) : null}
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-fg-muted" /> : null}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-risk/30 bg-risk/10 p-3 text-sm text-risk">{error}</div>
      ) : null}

      {isLoading ? (
        <div className="relative flex min-h-[540px] flex-col items-center justify-center overflow-hidden rounded-xl border border-hairline bg-surface-2 p-8 text-center">
          {/* Scanning animation gradient */}
          <div className="absolute inset-x-0 top-0 h-40 rk-scan bg-gradient-to-b from-brand/15 via-brand/5 to-transparent" />

          <div className="rk-pulse-dot relative mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-glow-brand">
            <Sparkles className="h-6 w-6" />
          </div>

          <h3 className="mb-1 text-base font-semibold text-fg">
            {locale === "en" ? "Finfold is rebuilding your content…" : "Finfold 正在重构内容…"}
          </h3>
          <p className="mb-8 max-w-xs text-xs leading-relaxed text-fg-muted">
            {locale === "en"
              ? "Running multi-channel layout analysis, brand compliance checks, and growth goal mapping"
              : "进行多渠道排版分析、品牌合规规则及增长目标映射"}
          </p>

          {/* Steps */}
          <div className="w-full max-w-xs space-y-3.5 rounded-xl border border-hairline bg-surface p-4 text-left shadow-panel">
            <LoadingStep index={0} currentIndex={loadingStepIndex} label={locale === "en" ? "Analyzing core product positioning and audience preferences..." : "分析产品核心定位与受众偏好..."} />
            <LoadingStep index={1} currentIndex={loadingStepIndex} label={locale === "en" ? "Adapting to native publishing tone for each social channel..." : "适配各社交渠道原生发布调性..."} />
            <LoadingStep index={2} currentIndex={loadingStepIndex} label={locale === "en" ? "Reviewing brand compliance rules and prohibited expressions..." : "审查品牌合规规则与禁用表达词..."} />
            <LoadingStep index={3} currentIndex={loadingStepIndex} label={locale === "en" ? "Reconstructing multi-platform content and CTA conversion points..." : "重构多平台内容与 CTA 转化点..."} />
          </div>
        </div>
      ) : null}

      {outputs.length === 0 && !isLoading ? (
        <div className="flex min-h-[540px] flex-col items-center justify-center rounded-xl border border-dashed border-hairline bg-surface-2 p-8 text-center">
          <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface text-brand">
            <Sparkles className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-fg">{copy.emptyTitle}</p>
          <p className="mt-1.5 max-w-sm text-xs leading-5 text-fg-muted">
            {copy.emptyBody}
          </p>
        </div>
      ) : null}

      <div className="grid gap-5">
        {outputs.map((output) => {
          const platform = getPlatform(output.platform);
          const copied = copiedPlatform === output.platform;
          const locked = !canUseOutputs;
          const previewBody = locked ? createPreview(output.body) : output.body;
          const mode = viewModes[output.platform] ?? "preview"; // Default to premium simulated preview

          return (
            <article key={output.platform} className="panel panel-hover p-4">
              <div className="mb-4 flex items-start justify-between gap-3 border-b border-hairline pb-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-fg-muted">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-surface-2 text-fg">
                      <platform.icon className="h-3.5 w-3.5" />
                    </span>
                    {platform.label}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold leading-tight text-fg">{output.title}</h3>
                    <span className="tag tag-success">{locale === "en" ? "Open" : "开放预览"}</span>
                    <span className="tag tag-neutral">{output.publishStatus ?? "draft"}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* Toggle Preview vs Raw Mode */}
                  <div className="inline-flex rounded-lg bg-surface-2 p-0.5">
                    <button
                      type="button"
                      onClick={() => toggleViewMode(output.platform)}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                        mode === "preview" ? "bg-surface text-fg shadow-panel" : "text-fg-muted hover:text-fg"
                      }`}
                    >
                      <Eye className="h-3 w-3" />
                      {locale === "en" ? "Preview" : "模拟预览"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleViewMode(output.platform)}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                        mode === "raw" ? "bg-surface text-fg shadow-panel" : "text-fg-muted hover:text-fg"
                      }`}
                    >
                      <Code className="h-3 w-3" />
                      {locale === "en" ? "Raw" : "原始结构"}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => void copyOutput(output)}
                    className="btn-ghost focus-ring px-3 py-1.5 text-xs"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-brand" /> : <Copy className="h-3.5 w-3.5" />}
                    {locked ? copy.unlockCopy : copied ? copy.copied : copy.copy}
                  </button>
                </div>
              </div>

              {/* AI-Generated Cover Image */}
              {output.imageUrl && (
                <div className="mb-4 overflow-hidden rounded-lg border border-hairline">
                  <img
                    src={output.imageUrl}
                    alt={output.title}
                    className="w-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      // Hide the image container on load error
                      (e.target as HTMLImageElement).parentElement!.style.display = "none";
                    }}
                  />
                </div>
              )}

              {/* View Rendering */}
              {mode === "preview" ? (
                <div className="flex justify-center rounded-xl border border-hairline bg-surface-2 p-4">
                  <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-hairline bg-white font-sans shadow-raised">
                    {/* High Fidelity Simulated Preview */}
                    <SocialMockup
                      platform={output.platform}
                      title={output.title}
                      body={previewBody}
                      cta={locked ? copy.lockedCtaPreview : output.cta}
                      notes={locked ? copy.lockedNotesPreview : output.notes}
                      locked={locked}
                      imageUrl={output.imageUrl}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 text-sm leading-6">
                  <ContentBlock label={copy.body} value={previewBody} locked={locked} />
                  <ContentBlock label={copy.cta} value={locked ? copy.lockedCtaPreview : output.cta} />
                  <ContentBlock label={copy.notes} value={locked ? copy.lockedNotesPreview : output.notes} />
                  <ContentBlock label={copy.strategy} value={locked ? createPreview(output.strategy) : output.strategy} />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function LoadingStep({ label, index, currentIndex }: { label: string; index: number; currentIndex: number }) {
  const isCompleted = currentIndex > index;
  const isActive = currentIndex === index;

  return (
    <div className={`flex items-center gap-3 transition-all duration-350 ${isCompleted || isActive ? "opacity-100" : "opacity-35"}`}>
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold transition-all ${
        isCompleted
          ? "bg-brand text-white"
          : isActive
            ? "animate-pulse bg-fg text-bg"
            : "bg-surface-2 text-fg-muted"
      }`}>
        {isCompleted ? "✓" : index + 1}
      </span>
      <span className={`text-xs transition-colors ${isActive ? "font-semibold text-fg" : isCompleted ? "font-medium text-fg-muted" : "text-fg-muted"}`}>
        {label}
        {isActive ? <span className="inline-block w-4 text-center animate-bounce">.</span> : null}
      </span>
    </div>
  );
}

function ContentBlock({ label, value, locked = false }: { label: string; value: string; locked?: boolean }) {
  return (
    <div className="panel-inset p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">{label}</p>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-fg">{value}</p>
      {locked ? (
        <p className="mt-3 rounded-lg border border-warn/30 bg-warn/10 p-2.5 text-xs font-medium text-warn">
          Showcase mode is open: full copy, CTA, notes, export, and analysis are available for review.
        </p>
      ) : null}
    </div>
  );
}

// Interactive Premium Phone Social Preview component
function SocialMockup({
  platform,
  title,
  body,
  cta,
  notes,
  imageUrl
}: {
  platform: string;
  title: string;
  body: string;
  cta: string;
  notes: string;
  locked: boolean;
  imageUrl?: string;
}) {
  switch (platform) {
    case "xiaohongshu":
      return <XiaohongshuMockup title={title} body={body} cta={cta} notes={notes} imageUrl={imageUrl} />;
    case "moments":
      return <MomentsMockup body={body} cta={cta} imageUrl={imageUrl} />;
    case "wechat":
      return <WechatMockup title={title} body={body} cta={cta} notes={notes} imageUrl={imageUrl} />;
    case "linkedin":
      return <LinkedInMockup body={body} cta={cta} notes={notes} imageUrl={imageUrl} />;
    case "reddit":
    case "hacker-news":
    case "indie-hackers":
      return <RedditMockup platform={platform} title={title} body={body} cta={cta} notes={notes} imageUrl={imageUrl} />;
    case "product-hunt":
      return <ProductHuntMockup title={title} body={body} cta={cta} notes={notes} imageUrl={imageUrl} />;
    case "medium-substack":
      return <NewsletterMockup title={title} body={body} cta={cta} imageUrl={imageUrl} />;
    case "threads":
      return <ThreadsMockup body={body} cta={cta} imageUrl={imageUrl} />;
    case "x":
    default:
      return <XMockup body={body} cta={cta} notes={notes} imageUrl={imageUrl} />;
  }
}

// ── Xiaohongshu (RED) — cover image + note detail ──────────────────
function XiaohongshuMockup({ title, body, cta, notes, imageUrl }: { title: string; body: string; cta: string; notes: string; imageUrl?: string }) {
  return (
      <div className="flex flex-col bg-white">
        {/* Xiaohongshu simulated navigation */}
        <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs text-slate-800 font-semibold">
          <span className="text-slate-400">Back</span>
          <span className="text-slate-900 font-bold">Note Detail</span>
          <Share2 className="h-4 w-4 text-slate-700" />
        </div>

        {/* Cover image */}
        {imageUrl ? (
          <div className="relative aspect-[4/3] overflow-hidden">
            <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 z-10">
              <span className="inline-flex rounded-full bg-rose-500 px-3 py-1 text-[10px] font-bold tracking-wider uppercase mb-1 shadow-sm">
                小红书 封面
              </span>
              <h4 className="text-sm font-bold leading-snug text-white line-clamp-2">{title}</h4>
            </div>
          </div>
        ) : (
        <div className="relative aspect-[4/3] bg-gradient-to-tr from-rose-400/80 via-rose-500 to-indigo-600/90 flex flex-col items-center justify-center p-6 text-center text-white">
          <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]" />
          <div className="relative z-10">
            <span className="inline-flex rounded-full bg-rose-500 px-3 py-1 text-[10px] font-bold tracking-wider uppercase mb-2 shadow-sm">
              小红书 封面
            </span>
            <h4 className="text-lg font-bold leading-snug px-3 line-clamp-3">{title}</h4>
            <p className="mt-2 text-[10px] text-white/80 font-medium">FINFOLD NATIVE PREVIEW</p>
          </div>
        </div>
        )}

        {/* Publisher row */}
        <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-50">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-rose-500 border border-slate-100 flex items-center justify-center text-white text-xs font-bold font-serif">
              红
            </div>
            <div>
              <p className="text-xs font-bold text-slate-950">Growth_Hacker</p>
              <p className="text-[10px] text-slate-400">Shanghai · Just now</p>
            </div>
          </div>
          <button type="button" className="rounded-full bg-rose-500 px-3.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-rose-600 transition-colors">
            Follow
          </button>
        </div>

        {/* Content detail */}
        <div className="p-3.5 max-h-72 overflow-y-auto leading-relaxed">
          <h1 className="text-sm font-bold text-slate-950 mb-2">{title}</h1>
          <p className="text-xs text-slate-800 whitespace-pre-wrap">{body}</p>
          {cta && <p className="mt-3 text-xs font-semibold text-rose-600">{cta}</p>}
          {notes && <p className="mt-3 text-[11px] text-slate-400 bg-slate-50 rounded p-2 border border-slate-100">{notes}</p>}
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            <span className="text-xs font-medium text-blue-500 hover:underline">#Finfold</span>
            <span className="text-xs font-medium text-blue-500 hover:underline">#独立开发者</span>
            <span className="text-xs font-medium text-blue-500 hover:underline">#内容增长</span>
          </div>
        </div>

        {/* Xiaohongshu Bottom Interaction Bar */}
        <div className="flex items-center justify-between border-t border-slate-100 px-3.5 py-3 bg-white text-slate-500">
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1 hover:text-rose-500 cursor-pointer">
              <Heart className="h-4.5 w-4.5" />
              99+
            </span>
            <span className="flex items-center gap-1 hover:text-yellow-500 cursor-pointer">
              <Star className="h-4.5 w-4.5" />
              Save
            </span>
            <span className="flex items-center gap-1 hover:text-blue-500 cursor-pointer">
              <MessageCircle className="h-4.5 w-4.5" />
              Comment
            </span>
          </div>
          <button type="button" className="rounded-full bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 text-xs font-bold transition-all">
            Message
          </button>
        </div>
      </div>
    );
  }

// ── WeChat Moments (朋友圈) — single post detail ───────────────────
function MomentsMockup({ body, cta, imageUrl }: { body: string; cta: string; imageUrl?: string }) {
  return (
      <div className="flex flex-col bg-[#EDEDED] text-slate-900 pb-3">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 font-semibold">
          <span className="text-slate-400">Back</span>
          <span className="text-slate-900 font-bold">Detail</span>
          <MoreHorizontal className="h-4 w-4 text-slate-700" />
        </div>

        {/* Post Container */}
        <div className="bg-white p-4.5 flex gap-3.5">
          {/* Left Avatar */}
          <div className="h-10 w-10 rounded bg-indigo-600 flex items-center justify-center shrink-0 font-bold text-white text-sm shadow-sm">
            ME
          </div>
          {/* Right Area */}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-[#576B95]">Moments Growth OS</h4>
            <div className="mt-2 text-sm text-slate-950 leading-relaxed whitespace-pre-wrap">
              {body}
            </div>
            {cta && <p className="mt-2 text-sm font-semibold text-[#576B95]">{cta}</p>}
            
            {/* Cover image or Grid Image placeholder */}
            {imageUrl ? (
              <div className="mt-3 overflow-hidden rounded-sm border border-slate-100 w-56">
                <img src={imageUrl} alt="Post cover" className="w-full object-cover" loading="lazy" />
              </div>
            ) : (
            <div className="mt-3 grid grid-cols-3 gap-1.5 w-56">
              <div className="aspect-square rounded-sm bg-gradient-to-br from-indigo-500 to-cyan-400 border border-slate-100 flex items-center justify-center text-[10px] text-white font-bold">Image</div>
              <div className="aspect-square rounded-sm bg-gradient-to-br from-purple-500 to-pink-400 border border-slate-100 flex items-center justify-center text-[10px] text-white font-bold">Repurpose</div>
              <div className="aspect-square rounded-sm bg-gradient-to-br from-emerald-500 to-lime-400 border border-slate-100 flex items-center justify-center text-[10px] text-white font-bold">Growth</div>
            </div>
            )}

            {/* Time & Action Button */}
            <div className="mt-3.5 flex items-center justify-between">
              <span className="text-[11px] text-[#7F7F7F]">1 min ago · Web</span>
              <span className="rounded bg-[#F7F7F7] px-2 py-0.5 text-xs font-bold text-[#576B95] border border-slate-100 hover:bg-slate-100 cursor-pointer">
                ..
              </span>
            </div>

            {/* Simulated Likes Area */}
            <div className="mt-2.5 rounded-sm bg-[#F7F7F7] p-2 text-xs border border-slate-100">
              <div className="flex items-center gap-1 border-b border-slate-200 pb-1.5 mb-1.5 text-[#576B95] font-semibold">
                <ThumbsUp className="h-3 w-3" />
                Sarah, Mike, Alex, Jenny
              </div>
              <div>
                <p className="text-slate-800"><span className="font-semibold text-[#576B95]">Tom:</span> This content kit is incredibly well-crafted — already shared it!</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
}

// ── X / Twitter — single post detail ───────────────────────────────
function XMockup({ body, cta, notes, imageUrl }: { body: string; cta: string; notes: string; imageUrl?: string }) {
  return (
    <div className="flex flex-col bg-white">
      {/* Twitter simulated nav */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs text-slate-800 font-semibold">
        <span className="text-slate-400">Back</span>
        <span className="text-slate-900 font-bold">Post</span>
        <Globe className="h-4 w-4 text-slate-500" />
      </div>

      <div className="p-4.5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-950 flex items-center justify-center text-white text-xs font-extrabold shadow-sm">
              X
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-slate-950 leading-none">Finfold</span>
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-500 text-[8px] text-white">✓</span>
              </div>
              <p className="text-xs text-slate-500">@finfold · Just now</p>
            </div>
          </div>
          <MoreHorizontal className="h-4 w-4 text-slate-400" />
        </div>

        {/* Content body */}
        <div className="mt-3 text-sm text-slate-900 leading-relaxed whitespace-pre-wrap">
          {body}
        </div>

        {/* AI-generated cover image */}
        {imageUrl && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
            <img src={imageUrl} alt="Post image" className="w-full object-cover" loading="lazy" />
          </div>
        )}
        
        {cta && (
          <p className="mt-3.5 text-sm font-semibold text-indigo-600 underline decoration-indigo-200 underline-offset-4 decoration-2">
            {cta}
          </p>
        )}
        
        {notes && (
          <p className="mt-3.5 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs leading-normal text-slate-500">
            {notes}
          </p>
        )}

        {/* Engagement metrics */}
        <div className="mt-4 border-y border-slate-100 py-3 flex items-center gap-5 text-xs text-slate-500 font-medium">
          <span><strong className="text-slate-950">1,240</strong> Views</span>
          <span><strong className="text-slate-950">84</strong> Likes</span>
          <span><strong className="text-slate-950">12</strong> Reposts</span>
        </div>

        {/* Action icons */}
        <div className="mt-3 flex items-center justify-between text-slate-400 px-2">
          <MessageSquare className="h-4.5 w-4.5 hover:text-sky-500 cursor-pointer" />
          <Share2 className="h-4.5 w-4.5 hover:text-emerald-500 cursor-pointer" />
          <Heart className="h-4.5 w-4.5 hover:text-rose-500 cursor-pointer" />
          <Send className="h-4.5 w-4.5 hover:text-sky-500 cursor-pointer" />
        </div>
      </div>
    </div>
  );
}

// ── WeChat Official Account (公众号) — long-form article ────────────
function WechatMockup({ title, body, cta, notes, imageUrl }: { title: string; body: string; cta: string; notes: string; imageUrl?: string }) {
  return (
    <div className="flex flex-col bg-white">
      {/* WeChat article nav */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs font-semibold text-slate-800">
        <span className="text-slate-400">✕</span>
        <span className="font-bold text-slate-900">公众号文章</span>
        <MoreHorizontal className="h-4 w-4 text-slate-700" />
      </div>

      <div className="max-h-[460px] overflow-y-auto px-4 py-4">
        {/* Article title */}
        <h1 className="text-lg font-bold leading-snug text-slate-900">{title}</h1>

        {/* Account row */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-[#07C160] text-xs font-bold text-white">公</div>
          <div className="leading-tight">
            <p className="text-xs font-medium text-[#576B95]">Finfold 增长笔记</p>
            <p className="text-[10px] text-slate-400">Just now · 北京</p>
          </div>
        </div>

        {/* Article body */}
        <div className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-slate-800">{body}</div>

        {/* AI-generated cover image */}
        {imageUrl && (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-100">
            <img src={imageUrl} alt={title} className="w-full object-cover" loading="lazy" />
          </div>
        )}

        {cta && (
          <div className="mt-4 rounded-lg bg-[#07C160]/10 p-3 text-sm font-semibold text-[#07A152]">{cta}</div>
        )}

        {notes && (
          <p className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs leading-normal text-slate-500">{notes}</p>
        )}

        {/* Footer actions */}
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><ThumbsUp className="h-4 w-4" /> 赞</span>
          <span className="flex items-center gap-1.5"><Star className="h-4 w-4" /> 在看</span>
          <span className="flex items-center gap-1.5"><Share2 className="h-4 w-4" /> 分享</span>
        </div>
      </div>
    </div>
  );
}

// ── LinkedIn — professional feed post ──────────────────────────────
function LinkedInMockup({ body, cta, notes, imageUrl }: { body: string; cta: string; notes: string; imageUrl?: string }) {
  return (
    <div className="flex flex-col bg-white">
      {/* LinkedIn nav */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-[#F4F2EE] px-3.5 py-2.5 text-xs font-semibold text-slate-700">
        <span className="font-bold text-[#0A66C2]">in</span>
        <span className="text-slate-500">Feed</span>
        <MoreHorizontal className="h-4 w-4 text-slate-500" />
      </div>

      <div className="px-4 py-3.5">
        {/* Author row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0A66C2] text-sm font-bold text-white">FF</div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-900">Finfold Founder</p>
              <p className="text-[11px] text-slate-500">Building AI growth tooling · 1st</p>
              <p className="text-[11px] text-slate-400">Just now · 🌐</p>
            </div>
          </div>
          <span className="text-sm font-semibold text-[#0A66C2]">+ Follow</span>
        </div>

        {/* Post body */}
        <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{body}</div>

        {cta && <p className="mt-3 text-sm font-semibold text-[#0A66C2]">{cta}</p>}

        {/* AI-generated cover image */}
        {imageUrl && (
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <img src={imageUrl} alt="Post cover" className="w-full object-cover" loading="lazy" />
          </div>
        )}

        {notes && (
          <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs leading-normal text-slate-500">{notes}</p>
        )}

        {/* Reaction count */}
        <div className="mt-3 flex items-center gap-1.5 border-b border-slate-100 pb-2 text-[11px] text-slate-500">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0A66C2] text-[8px] text-white">👍</span>
          <span>Sarah, Mike and 248 others</span>
          <span className="ml-auto">37 comments</span>
        </div>

        {/* Action bar */}
        <div className="mt-1 flex items-center justify-between px-1 text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1.5 py-1.5"><ThumbsUp className="h-4 w-4" /> Like</span>
          <span className="flex items-center gap-1.5 py-1.5"><MessageCircle className="h-4 w-4" /> Comment</span>
          <span className="flex items-center gap-1.5 py-1.5"><Repeat2 className="h-4 w-4" /> Repost</span>
          <span className="flex items-center gap-1.5 py-1.5"><Send className="h-4 w-4" /> Send</span>
        </div>
      </div>
    </div>
  );
}

// ── Reddit / HN / Indie Hackers — discussion thread post ───────────
function RedditMockup({ platform, title, body, cta, notes, imageUrl }: { platform: string; title: string; body: string; cta: string; notes: string; imageUrl?: string }) {
  const meta =
    platform === "hacker-news"
      ? { brand: "Hacker News", accent: "#FF6600", sub: "news.ycombinator.com", tag: "Show HN" }
      : platform === "indie-hackers"
        ? { brand: "Indie Hackers", accent: "#0E2439", sub: "indiehackers.com", tag: "Milestone" }
        : { brand: "Reddit", accent: "#FF4500", sub: "r/SideProject", tag: "Discussion" };

  return (
    <div className="flex flex-col bg-white">
      {/* Nav */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs font-semibold text-slate-700">
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: meta.accent }}>
            {platform === "hacker-news" ? "Y" : platform === "indie-hackers" ? "IH" : "r"}
          </span>
          <span className="text-slate-900">{meta.sub}</span>
        </span>
        <MoreHorizontal className="h-4 w-4 text-slate-500" />
      </div>

      <div className="flex min-w-0 gap-2.5 px-3 py-3.5">
        {/* Vote rail */}
        <div className="flex flex-col items-center gap-0.5 pt-0.5 text-slate-400">
          <ArrowBigUp className="h-5 w-5" style={{ color: meta.accent }} />
          <span className="text-xs font-bold text-slate-700">2.4k</span>
          <ArrowBigDown className="h-5 w-5" />
        </div>

        {/* Body column */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: meta.accent }}>{meta.tag}</span>
            <span>Posted by u/finfold_dev · 1h</span>
          </div>

          <h3 className="mt-2 text-sm font-bold leading-snug text-slate-900">{title}</h3>

          <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{body}</div>

          {imageUrl && (
            <div className="mt-2.5 overflow-hidden rounded-lg border border-slate-100">
              <img src={imageUrl} alt={title} className="w-full object-cover" loading="lazy" />
            </div>
          )}

          {cta && <p className="mt-2.5 text-[13px] font-semibold text-slate-600 italic">{cta}</p>}

          {notes && (
            <p className="mt-2.5 rounded border border-slate-100 bg-slate-50 p-2 text-[11px] leading-normal text-slate-400">{notes}</p>
          )}

          {/* Action row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> 184 Comments</span>
            <span className="flex items-center gap-1"><Share2 className="h-3.5 w-3.5" /> Share</span>
            <span className="flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" /> Save</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Product Hunt — launch card ─────────────────────────────────────
function ProductHuntMockup({ title, body, cta, notes, imageUrl }: { title: string; body: string; cta: string; notes: string; imageUrl?: string }) {
  return (
    <div className="flex flex-col bg-white">
      {/* Nav */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs font-semibold text-slate-700">
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#DA552F] text-[11px] font-bold text-white">P</span>
          <span className="text-slate-900">Product Hunt</span>
        </span>
        <MoreHorizontal className="h-4 w-4 text-slate-500" />
      </div>

      <div className="px-4 py-4">
        {/* Product header */}
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#DA552F] to-amber-500 text-lg font-black text-white shadow-sm">F</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">Finfold</p>
            {/* Tagline = title */}
            <p className="text-[13px] leading-snug text-slate-600">{title}</p>
          </div>
          {/* Upvote button */}
          <div className="flex flex-col items-center justify-center rounded-lg border border-[#DA552F] px-2.5 py-1 text-[#DA552F]">
            <ChevronUp className="h-4 w-4" />
            <span className="text-xs font-bold">1.2K</span>
          </div>
        </div>

        {/* Topic pills */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["Marketing", "Artificial Intelligence", "SaaS"].map((t) => (
            <span key={t} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">{t}</span>
          ))}
        </div>

        {/* AI-generated cover image */}
        {imageUrl && (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-100">
            <img src={imageUrl} alt={title} className="w-full object-cover" loading="lazy" />
          </div>
        )}

        {/* Maker comment */}
        <div className="mt-3.5 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-[#DA552F]">
            <Award className="h-3.5 w-3.5" /> MAKER COMMENT
          </div>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{body}</div>
        </div>

        {cta && <p className="mt-3 text-[13px] font-semibold text-[#DA552F]">{cta}</p>}

        {notes && (
          <p className="mt-3 rounded-lg border border-slate-100 bg-white p-2.5 text-[11px] leading-normal text-slate-400">{notes}</p>
        )}
      </div>
    </div>
  );
}

// ── Medium / Substack — article reader ─────────────────────────────
function NewsletterMockup({ title, body, cta, imageUrl }: { title: string; body: string; cta: string; imageUrl?: string }) {
  return (
    <div className="flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs font-semibold text-slate-700">
        <span className="font-serif text-base font-bold text-slate-900">M</span>
        <span className="text-slate-500">Story</span>
        <Bookmark className="h-4 w-4 text-slate-500" />
      </div>

      <div className="max-h-[440px] overflow-y-auto px-5 py-5">
        <h1 className="font-serif text-2xl font-bold leading-tight text-slate-900">{title}</h1>
        <div className="mt-3 flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">FF</div>
          <div className="text-xs leading-tight">
            <p className="font-semibold text-slate-800">Finfold</p>
            <p className="text-slate-400">6 min read · Just now</p>
          </div>
        </div>
        <div className="mt-4 whitespace-pre-wrap font-serif text-[15px] leading-7 text-slate-800">{body}</div>

        {/* AI-generated cover image */}
        {imageUrl && (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-100">
            <img src={imageUrl} alt={title} className="w-full object-cover" loading="lazy" />
          </div>
        )}

        {cta && <p className="mt-4 font-serif text-[15px] font-semibold text-emerald-700">{cta}</p>}
      </div>
    </div>
  );
}

// ── Threads — casual short post ────────────────────────────────────
function ThreadsMockup({ body, cta, imageUrl }: { body: string; cta: string; imageUrl?: string }) {
  return (
    <div className="flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-xs font-semibold text-slate-700">
        <span className="text-slate-400">←</span>
        <span className="font-bold text-slate-900">Thread</span>
        <MoreHorizontal className="h-4 w-4 text-slate-500" />
      </div>
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">@</div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">finfold</p>
            <p className="text-[11px] text-slate-400">Just now</p>
          </div>
        </div>
        <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-900">{body}</div>

        {/* AI-generated cover image */}
        {imageUrl && (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-100">
            <img src={imageUrl} alt="Post image" className="w-full object-cover" loading="lazy" />
          </div>
        )}

        {cta && <p className="mt-3 text-sm font-semibold text-slate-600">{cta}</p>}
        <div className="mt-4 flex items-center gap-5 text-slate-400">
          <Heart className="h-5 w-5" />
          <MessageCircle className="h-5 w-5" />
          <Repeat2 className="h-5 w-5" />
          <Send className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function formatOutput(output: KitOutput, platformLabel: string): string {
  return `${platformLabel}\n\nTitle: ${output.title}\n\nBody:\n${output.body}\n\nCTA: ${output.cta}\n\nNotes: ${output.notes}\n\nStrategy: ${output.strategy}`;
}

function formatAllOutputs(outputs: KitOutput[]): string {
  const header = `# Finfold Content Kit\n\nGenerated: ${new Date().toLocaleString()}`;
  const body = outputs
    .map((output) => {
      const platform = getPlatform(output.platform);
      return `## ${platform.label}\n\n${formatOutput(output, platform.label)}`;
    })
    .join("\n\n---\n\n");

  return `${header}\n\n${body}\n`;
}

function createPreview(body: string): string {
  const limit = Math.max(180, Math.round(body.length * 0.28));
  return body.length > limit ? `${body.slice(0, limit).trim()}...` : body;
}
