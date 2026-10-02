"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileCode2,
  FileStack,
  FileJson,
  Film,
  Images,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X
} from "@/components/ui/icons";
import type { KitOutput } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import { getPlatform, type PlatformId } from "@/lib/platforms";
import { exportCoverPng } from "@/lib/cover/cover-export";
import {
  buildLocalVisualStory,
  visualStorySchema,
  visualStoryThemes,
  type VisualStory,
  type VisualStoryPage,
  type VisualStoryPageRole,
  type VisualStoryStrategy,
  type VisualStoryTheme
} from "@/lib/visual-story";
import {
  getDefaultVisualStoryFormat,
  getRecommendedVisualStoryFormats,
  visualStoryFormats,
  type VisualStoryFormatId
} from "@/lib/visual-story-formats";
import { VisualStoryCanvas } from "@/components/workbench/visual-story/VisualStoryCanvas";
import { CoverStudio } from "@/components/workbench/cover/CoverStudio";
import type { VisualIntelligencePlan } from "@/lib/visual-intelligence";
import { buildPublicationPackage } from "@/lib/publication-package";
import type { BrandBrain } from "@/lib/brand-brain";
import { buildAnimatedStoryHtml, buildMotionStoryboard } from "@/lib/motion-storyboard";
import { addToast } from "@/components/ui/Toast";

type Props = {
  output: KitOutput;
  platform: PlatformId;
  locale: Locale;
  plan?: VisualIntelligencePlan;
  kitId?: string;
  canExport?: boolean;
  onLockedExport?: () => void;
  onConfirmImageRights?: () => Promise<boolean>;
  onClose: () => void;
  onCoverSaved?: (imageUrl: string) => void;
  brandBrain?: BrandBrain;
  referenceImageUrl?: string;
};

const PAGE_COUNTS = [5, 7, 9] as const;

type CloudSaveState = "local" | "loading" | "saving" | "saved" | "error";

export function VisualStoryStudio({ output, platform, locale, plan, kitId, canExport = true, onLockedExport, onConfirmImageRights, onClose, onCoverSaved, brandBrain, referenceImageUrl }: Props) {
  const copy = visualStoryCopy[locale];
  const body = output.finalBody || output.body;
  const storageKey = `finfold:visual-story:${output.id || `${platform}:${output.title}`}`;
  const formatStorageKey = `${storageKey}:format`;
  const defaultFormat = plan ? visualStoryFormats[plan.formatId] : getDefaultVisualStoryFormat(platform);
  const formatOptions = useMemo(() => getRecommendedVisualStoryFormats(platform), [platform]);
  const [story, setStory] = useState<VisualStory>(() => buildLocalVisualStory(output, platform, locale, plan?.pageCount ?? 5, plan?.theme, plan?.strategy));
  const [formatId, setFormatId] = useState<VisualStoryFormatId>(defaultFormat.id);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [pageCount, setPageCount] = useState<(typeof PAGE_COUNTS)[number]>(plan?.pageCount ?? 5);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [coverStudioOpen, setCoverStudioOpen] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState(output.imageUrl || "");
  const [cloudSaveState, setCloudSaveState] = useState<CloudSaveState>(kitId && output.id ? "loading" : "local");
  const [cloudReady, setCloudReady] = useState(false);
  const exportRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastCloudPayloadRef = useRef("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = visualStorySchema.safeParse(JSON.parse(saved));
      if (parsed.success) setStory(parsed.data);
    } catch {
      // A damaged browser draft should never block a fresh story from real content.
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(story));
    } catch {
      // Export remains available even when browser storage is disabled.
    }
  }, [storageKey, story]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(formatStorageKey);
      if (saved && saved in visualStoryFormats) setFormatId(saved as VisualStoryFormatId);
    } catch {
      // The platform default remains usable when storage is unavailable.
    }
  }, [formatStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(formatStorageKey, formatId);
    } catch {
      // Size switching and export do not depend on local storage.
    }
  }, [formatId, formatStorageKey]);

  useEffect(() => {
    if (!kitId || !output.id) {
      setCloudReady(true);
      setCloudSaveState("local");
      return;
    }
    const controller = new AbortController();
    lastCloudPayloadRef.current = "";
    setCloudReady(false);
    setCloudSaveState("loading");
    void fetch(`/api/kits/${kitId}/outputs/${output.id}/visual-story`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { draft?: { story: VisualStory; formatId: VisualStoryFormatId } | null; error?: string };
        if (!response.ok) throw new Error(data.error || copy.loadFailed);
        if (data.draft) {
          const parsed = visualStorySchema.parse(data.draft.story);
          setStory(parsed);
          if (data.draft.formatId in visualStoryFormats) setFormatId(data.draft.formatId);
          lastCloudPayloadRef.current = JSON.stringify({ story: parsed, formatId: data.draft.formatId });
        }
        setCloudSaveState("saved");
        setCloudReady(true);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setCloudSaveState("error");
        setError(caught instanceof Error ? caught.message : copy.loadFailed);
      });
    return () => controller.abort();
  }, [copy.loadFailed, kitId, output.id]);

  useEffect(() => {
    if (!kitId || !output.id || !cloudReady) return;
    const payload = JSON.stringify({ story, formatId });
    if (payload === lastCloudPayloadRef.current) return;
    setCloudSaveState("saving");
    const timer = window.setTimeout(() => {
      void fetch(`/api/kits/${kitId}/outputs/${output.id}/visual-story`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload
      }).then(async (response) => {
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || copy.saveFailed);
        lastCloudPayloadRef.current = payload;
        setCloudSaveState("saved");
      }).catch((caught) => {
        setCloudSaveState("error");
        setError(caught instanceof Error ? caught.message : copy.saveFailed);
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [cloudReady, copy.saveFailed, formatId, kitId, output.id, story]);

  const activePage = story.pages[activePageIndex] ?? story.pages[0];
  const platformInfo = getPlatform(platform);
  const format = visualStoryFormats[formatId];

  async function generateStory() {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/image/storyboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({
          platform,
          locale,
          title: output.title,
          body,
          cta: output.cta,
          pageCount,
          theme: story.theme,
          strategy: story.strategy,
          primaryMetric: plan?.outcome
        })
      });
      if (!response.ok) {
        // Map the known failure statuses to specific, actionable copy —
        // otherwise a 402 (out of credits), 409 (already processing), and
        // 429 (rate limited) all look like the generic "failed" message.
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        const fallback =
          response.status === 402
            ? copy.generateOutOfCredits
            : response.status === 409
              ? copy.generateExisting
              : response.status === 429
                ? copy.generateRateLimited
                : response.status === 504
                  ? copy.generateTimeout
                  : copy.generateFailed;
        throw new Error(data.error || fallback);
      }
      const data = (await response.json()) as { story?: VisualStory; error?: string };
      if (!data.story) throw new Error(data.error || copy.generateFailed);
      const parsed = visualStorySchema.parse(data.story);
      setStory(parsed);
      setActivePageIndex(0);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : copy.generateFailed;
      // Surface the failure two ways: a toast (visible immediately,
      // wherever the user is looking) and the inline message near the
      // button below — a 402/409/429/timeout previously only rendered at
      // the bottom of a scrollable right-hand rail, so it looked like the
      // button silently did nothing.
      addToast("error", message);
      setError(message);
    } finally {
      setGenerating(false);
    }
  }

  function resetToSourceLayout() {
    setStory(buildLocalVisualStory(output, platform, locale, pageCount, story.theme, story.strategy));
    setActivePageIndex(0);
    setError(null);
  }

  function updatePage(patch: Partial<VisualStoryPage>) {
    setStory((current) => ({
      ...current,
      pages: current.pages.map((page, index) => (index === activePageIndex ? { ...page, ...patch } : page))
    }));
  }

  function updateTheme(theme: VisualStoryTheme) {
    setStory((current) => ({ ...current, theme }));
  }

  function updateStrategy(strategy: VisualStoryStrategy) {
    setStory((current) => ({ ...current, strategy }));
  }

  function addPage() {
    const next: VisualStoryPage = {
      id: `manual-${crypto.randomUUID()}`,
      role: "insight",
      kicker: copy.newPageKicker,
      title: copy.newPageTitle,
      body: "",
      points: [],
      emphasis: ""
    };
    setStory((current) => {
      const pages = [...current.pages];
      pages.splice(activePageIndex + 1, 0, next);
      return { ...current, pages: pages.slice(0, 9) };
    });
    setActivePageIndex((current) => Math.min(current + 1, 8));
  }

  function deletePage() {
    if (story.pages.length <= 3) return;
    setStory((current) => ({ ...current, pages: current.pages.filter((_, index) => index !== activePageIndex) }));
    setActivePageIndex((current) => Math.max(0, Math.min(current - 1, story.pages.length - 2)));
  }

  function movePage(direction: -1 | 1) {
    const nextIndex = activePageIndex + direction;
    if (nextIndex < 0 || nextIndex >= story.pages.length) return;
    setStory((current) => {
      const pages = [...current.pages];
      [pages[activePageIndex], pages[nextIndex]] = [pages[nextIndex], pages[activePageIndex]];
      return { ...current, pages };
    });
    setActivePageIndex(nextIndex);
  }

  async function exportPages(indices: number[]) {
    if (!canExport) {
      onLockedExport?.();
      return;
    }
    if (output.imageUrl && onConfirmImageRights && !(await onConfirmImageRights())) return;
    setExporting(true);
    setExportProgress(0);
    setError(null);
    try {
      for (let step = 0; step < indices.length; step += 1) {
        const index = indices[step];
        const page = story.pages[index];
        const node = exportRefs.current[page.id];
        if (!node) continue;
        await exportCoverPng(node, format, visualStoryFilename(platform, format.id, index + 1));
        setExportProgress(Math.round(((step + 1) / indices.length) * 100));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.exportFailed);
    } finally {
      window.setTimeout(() => {
        setExporting(false);
        setExportProgress(0);
      }, 350);
    }
  }

  async function downloadPublicationPackage() {
    if (!canExport) {
      onLockedExport?.();
      return;
    }
    if (output.imageUrl && onConfirmImageRights && !(await onConfirmImageRights())) return;
    const manifest = buildPublicationPackage({ output, platform, locale, story, formatId });
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `finfold-${platform}-publication-package-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(blobUrl);
  }

  async function downloadMotionManifest() {
    if (!canExport) {
      onLockedExport?.();
      return;
    }
    if (output.imageUrl && onConfirmImageRights && !(await onConfirmImageRights())) return;
    downloadTextFile(
      `finfold-${platform}-motion-storyboard-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(buildMotionStoryboard(story, formatId), null, 2),
      "application/json"
    );
  }

  async function downloadAnimatedHtml() {
    if (!canExport) {
      onLockedExport?.();
      return;
    }
    if (output.imageUrl && onConfirmImageRights && !(await onConfirmImageRights())) return;
    const storyboard = buildMotionStoryboard(story, formatId);
    downloadTextFile(
      `finfold-${platform}-animated-story-${new Date().toISOString().slice(0, 10)}.html`,
      buildAnimatedStoryHtml(storyboard),
      "text/html;charset=utf-8"
    );
  }

  const previewScale = useMemo(() => Math.min(1, 430 / format.cssWidth, 560 / format.cssHeight), [format]);
  const thumbnailScale = useMemo(() => Math.min(100 / format.cssWidth, 133 / format.cssHeight), [format]);

  if (coverStudioOpen) {
    return (
      <CoverStudio
        output={{ ...output, imageUrl: coverImageUrl }}
        platform={platform}
        locale={locale}
        kitId={kitId}
        canExport={canExport}
        onLockedExport={onLockedExport}
        onConfirmImageRights={onConfirmImageRights}
        onClose={() => setCoverStudioOpen(false)}
        onSaveCover={(imageUrl) => {
          setCoverImageUrl(imageUrl);
          onCoverSaved?.(imageUrl);
          setCoverStudioOpen(false);
        }}
        brandBrain={brandBrain}
        referenceImageUrl={referenceImageUrl}
      />
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="visual-story-title" className="fixed inset-0 z-50 flex items-center justify-center bg-fg/55 p-0 backdrop-blur-sm md:p-4">
      <div className="rk-enter relative flex h-dvh w-full max-w-[1440px] flex-col overflow-hidden border border-hairline bg-surface shadow-panel md:h-[calc(100vh-2rem)] md:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3 md:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-action/[0.12] text-action-strong dark:text-action"><FileStack className="h-4 w-4" /></span>
              <div className="min-w-0">
                <h2 id="visual-story-title" className="truncate text-sm font-bold text-fg">{copy.title}</h2>
                <p className="truncate text-[11px] text-fg-muted">{platformInfo.label} · {format.width}×{format.height} · {format.ratio} · {story.pages.length} {copy.pages}</p>
                <p className={`mt-0.5 truncate text-[9px] font-semibold ${cloudSaveState === "error" ? "text-risk" : "text-positive"}`}>{saveStateLabel(cloudSaveState, copy)}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCoverStudioOpen(true)}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs font-bold text-fg hover:border-action/40 hover:bg-action/[0.035]"
              title={copy.coverAssetsHint}
            >
              <Images className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{copy.coverAssets}</span>
            </button>
            <label className="hidden items-center gap-2 rounded-lg border border-hairline bg-surface-2 px-2.5 py-1.5 text-[11px] font-semibold text-fg-muted sm:flex">
              {copy.pageCount}
              <select value={pageCount} onChange={(event) => setPageCount(Number(event.target.value) as (typeof PAGE_COUNTS)[number])} className="bg-transparent font-bold text-fg outline-none">
                {PAGE_COUNTS.map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void generateStory()} disabled={generating || exporting} className="btn-primary focus-ring px-3 py-2 text-xs disabled:opacity-60">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {generating ? copy.generating : copy.generate}
            </button>
            <button type="button" onClick={onClose} disabled={exporting} aria-label={copy.close} className="focus-ring rounded-lg p-2 text-fg-muted hover:bg-surface-2 hover:text-fg"><X className="h-4 w-4" /></button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[170px_minmax(420px,1fr)_340px]">
          <aside className="order-2 flex min-h-0 gap-2 overflow-x-auto border-t border-hairline bg-surface-2/35 p-3 lg:order-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:border-r lg:border-t-0">
            {story.pages.map((page, index) => (
              <button key={page.id} type="button" onClick={() => setActivePageIndex(index)} aria-pressed={activePageIndex === index} className={`focus-ring shrink-0 rounded-xl border p-1.5 text-left transition ${activePageIndex === index ? "border-action bg-action/[0.08] shadow-panel" : "border-hairline bg-surface hover:border-action/40"}`}>
                <div className="relative overflow-hidden rounded-lg bg-surface-2" style={{ width: 100, height: 133 }}>
                  <div style={{ position: "absolute", left: (100 - format.cssWidth * thumbnailScale) / 2, top: (133 - format.cssHeight * thumbnailScale) / 2, transform: `scale(${thumbnailScale})`, transformOrigin: "top left" }}>
                    <VisualStoryCanvas page={page} pageIndex={index} pageCount={story.pages.length} storyTitle={story.title} themeId={story.theme} paletteOverride={plan?.paletteOverride} format={format} coverImageUrl={coverImageUrl || undefined} locale={locale} />
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
                  <span className="text-[10px] font-bold text-fg">{String(index + 1).padStart(2, "0")}</span>
                  <span className="truncate text-[9px] text-fg-muted">{roleLabel(page.role, locale)}</span>
                </div>
              </button>
            ))}
            {story.pages.length < 9 ? (
              <button type="button" onClick={addPage} className="focus-ring flex min-h-16 w-28 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-hairline text-[10px] font-semibold text-fg-muted hover:border-action hover:text-action-strong dark:hover:text-action lg:w-full"><Plus className="h-3.5 w-3.5" />{copy.addPage}</button>
            ) : null}
          </aside>

          <main className="order-1 flex min-h-[48dvh] items-center justify-center overflow-auto bg-surface-2 p-4 lg:order-2 lg:min-h-0 lg:p-8">
            <div className="rounded-[28px] bg-fg/[0.08] p-3 shadow-raised">
              <div style={{ width: format.cssWidth * previewScale, height: format.cssHeight * previewScale, overflow: "hidden", borderRadius: 18 }}>
                <div style={{ transform: `scale(${previewScale})`, transformOrigin: "top left" }}>
                  <VisualStoryCanvas page={activePage} pageIndex={activePageIndex} pageCount={story.pages.length} storyTitle={story.title} themeId={story.theme} paletteOverride={plan?.paletteOverride} format={format} coverImageUrl={coverImageUrl || undefined} locale={locale} />
                </div>
              </div>
            </div>
          </main>

          <aside className="order-3 min-h-0 overflow-y-auto border-t border-hairline p-4 lg:border-l lg:border-t-0 lg:p-5">
            <section>
              <p className="eyebrow">{copy.outputFormat}</p>
              <select value={formatId} onChange={(event) => setFormatId(event.target.value as VisualStoryFormatId)} className="field-input mt-2 w-full text-xs font-semibold">
                {formatOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id === defaultFormat.id ? `${copy.platformDefault} · ` : ""}{locale === "zh" ? item.labelZh : item.labelEn} · {item.width}×{item.height} · {item.ratio}
                  </option>
                ))}
              </select>
              <div className="mt-2 rounded-xl border border-action/15 bg-action/[0.06] px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold text-fg">{locale === "zh" ? format.usageZh : format.usageEn}</p>
                    <p className="mt-1 text-[10px] leading-4 text-fg-muted">{format.width}×{format.height}px · {format.ratio}{format.safeInsets ? ` · ${copy.safeArea}` : ""}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface px-2 py-1 text-[9px] font-bold text-action-strong dark:text-action">{format.source.official ? copy.officialSpec : copy.industryReference}</span>
                </div>
                <a href={format.source.url} target="_blank" rel="noreferrer" className="focus-ring mt-2 inline-flex rounded text-[9px] font-semibold text-fg-muted underline decoration-hairline underline-offset-2 hover:text-action-strong dark:hover:text-action">
                  {copy.specSource}: {format.source.label} ↗
                </a>
              </div>
            </section>

            <section className="mt-5 border-t border-hairline pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">{copy.visualSystem}</p>
                  <p className="mt-1 text-[11px] text-fg-muted">{copy.visualSystemHint}</p>
                </div>
                <button type="button" onClick={resetToSourceLayout} className="focus-ring shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg">{copy.quickLayout}</button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(Object.keys(visualStoryThemes) as VisualStoryTheme[]).map((themeId) => {
                  const theme = visualStoryThemes[themeId];
                  return (
                    <button key={themeId} type="button" onClick={() => updateTheme(themeId)} aria-pressed={story.theme === themeId} className={`focus-ring rounded-xl border p-2 text-left transition ${story.theme === themeId ? "border-action shadow-panel" : "border-hairline"}`}>
                      <span className="block h-8 rounded-lg" style={{ background: theme.paper, border: `6px solid ${theme.accent}` }} />
                      <span className="mt-1.5 block truncate text-[9px] font-bold text-fg">{locale === "zh" ? theme.labelZh : theme.labelEn}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3">
                <p className="text-[10px] font-semibold text-fg-muted">{copy.contentStrategy}</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["story-driven", "information-dense", "visual-first"] as VisualStoryStrategy[]).map((strategy) => (
                    <button
                      key={strategy}
                      type="button"
                      onClick={() => updateStrategy(strategy)}
                      aria-pressed={story.strategy === strategy}
                      className={`focus-ring rounded-lg border px-2 py-2 text-[9px] font-bold leading-4 transition ${story.strategy === strategy ? "border-action bg-action/[0.08] text-action-strong dark:text-action" : "border-hairline text-fg-muted hover:border-action/40 hover:text-fg"}`}
                    >
                      {strategyLabel(strategy, locale)}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-4 text-fg-muted">{strategyDescription(story.strategy, locale)}</p>
              </div>
            </section>

            <section className="mt-5 border-t border-hairline pt-5">
              <div className="flex items-center justify-between gap-2">
                <p className="eyebrow">{copy.editPage} {activePageIndex + 1}</p>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => movePage(-1)} disabled={activePageIndex === 0} aria-label={copy.movePrevious} className="focus-ring rounded-lg p-1.5 text-fg-muted hover:bg-surface-2 disabled:opacity-30"><ArrowLeft className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => movePage(1)} disabled={activePageIndex === story.pages.length - 1} aria-label={copy.moveNext} className="focus-ring rounded-lg p-1.5 text-fg-muted hover:bg-surface-2 disabled:opacity-30"><ArrowRight className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={deletePage} disabled={story.pages.length <= 3} aria-label={copy.deletePage} className="focus-ring rounded-lg p-1.5 text-fg-muted hover:bg-risk/10 hover:text-risk disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                <label className="grid gap-1 text-[10px] font-semibold text-fg-muted">{copy.layout}
                  <select value={activePage.role} onChange={(event) => updatePage({ role: event.target.value as VisualStoryPageRole })} className="field-input text-xs">
                    {(["cover", "insight", "list", "quote", "cta"] as VisualStoryPageRole[]).map((role) => <option key={role} value={role}>{roleLabel(role, locale)}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-[10px] font-semibold text-fg-muted">{copy.kicker}
                  <input value={activePage.kicker} maxLength={32} onChange={(event) => updatePage({ kicker: event.target.value })} className="field-input text-xs" />
                </label>
                <label className="grid gap-1 text-[10px] font-semibold text-fg-muted">{copy.headline}
                  <textarea value={activePage.title} rows={3} maxLength={90} onChange={(event) => updatePage({ title: event.target.value })} className="field-input resize-y text-xs" />
                </label>
                {activePage.role === "list" ? (
                  <label className="grid gap-1 text-[10px] font-semibold text-fg-muted">{copy.points}
                    <textarea value={activePage.points.join("\n")} rows={5} onChange={(event) => updatePage({ points: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 5) })} className="field-input resize-y text-xs" />
                    <span className="font-normal">{copy.onePointPerLine}</span>
                  </label>
                ) : (
                  <label className="grid gap-1 text-[10px] font-semibold text-fg-muted">{copy.body}
                    <textarea value={activePage.body} rows={5} maxLength={320} onChange={(event) => updatePage({ body: event.target.value })} className="field-input resize-y text-xs" />
                  </label>
                )}
                <label className="grid gap-1 text-[10px] font-semibold text-fg-muted">{copy.emphasis}
                  <input value={activePage.emphasis} maxLength={48} onChange={(event) => updatePage({ emphasis: event.target.value })} className="field-input text-xs" />
                </label>
              </div>
              <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[10px] leading-4 text-fg-muted">{copy.exactText}</p>
            </section>

            {error ? <p className="mt-4 rounded-lg border border-risk/25 bg-risk/10 px-3 py-2 text-[11px] leading-5 text-risk" role="alert">{error}</p> : null}

            <section className="mt-5 grid grid-cols-2 gap-2 border-t border-hairline pt-5">
              <button type="button" onClick={() => void exportPages([activePageIndex])} disabled={exporting} className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2.5 text-xs font-bold text-fg hover:bg-surface-2 disabled:opacity-60"><Download className="h-3.5 w-3.5" />{copy.downloadPage}</button>
              <button type="button" onClick={() => void exportPages(story.pages.map((_, index) => index))} disabled={exporting} className="btn-primary focus-ring justify-center px-3 py-2.5 text-xs disabled:opacity-60">{exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileStack className="h-3.5 w-3.5" />}{exporting ? `${exportProgress}%` : !canExport ? copy.downloadLocked : copy.downloadAll}</button>
            </section>
            <button type="button" onClick={() => void downloadPublicationPackage()} className="focus-ring mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-bold text-fg-muted hover:bg-surface-2 hover:text-fg"><FileJson className="h-3.5 w-3.5" />{!canExport ? copy.packageLocked : copy.downloadPackage}</button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void downloadAnimatedHtml()} className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline px-2 py-2 text-[10px] font-bold text-fg-muted hover:border-action/40 hover:text-fg"><FileCode2 className="h-3.5 w-3.5" />{!canExport ? copy.motionLocked : copy.downloadAnimatedHtml}</button>
              <button type="button" onClick={() => void downloadMotionManifest()} className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline px-2 py-2 text-[10px] font-bold text-fg-muted hover:border-action/40 hover:text-fg"><Film className="h-3.5 w-3.5" />{!canExport ? copy.motionLocked : copy.downloadMotionManifest}</button>
            </div>
            <p className="mt-1.5 text-center text-[9px] text-fg-muted">{copy.packageHint}</p>
          </aside>
        </div>

        <div style={{ position: "fixed", left: -10000, top: 0 }} aria-hidden="true">
          {story.pages.map((page, index) => (
            <div key={page.id} ref={(element) => { exportRefs.current[page.id] = element; }}>
              <VisualStoryCanvas page={page} pageIndex={index} pageCount={story.pages.length} storyTitle={story.title} themeId={story.theme} paletteOverride={plan?.paletteOverride} format={format} coverImageUrl={coverImageUrl || undefined} locale={locale} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function roleLabel(role: VisualStoryPageRole, locale: Locale) {
  const labels: Record<VisualStoryPageRole, { zh: string; en: string }> = {
    cover: { zh: "封面", en: "Cover" },
    insight: { zh: "观点", en: "Insight" },
    list: { zh: "清单", en: "List" },
    quote: { zh: "金句", en: "Quote" },
    cta: { zh: "行动", en: "CTA" }
  };
  return labels[role][locale];
}

function strategyLabel(strategy: VisualStoryStrategy, locale: Locale): string {
  const labels: Record<VisualStoryStrategy, { zh: string; en: string }> = {
    "story-driven": { zh: "故事驱动", en: "Story" },
    "information-dense": { zh: "信息密集", en: "Dense" },
    "visual-first": { zh: "视觉优先", en: "Visual" }
  };
  return labels[strategy][locale];
}

function strategyDescription(strategy: VisualStoryStrategy, locale: Locale): string {
  const descriptions: Record<VisualStoryStrategy, { zh: string; en: string }> = {
    "story-driven": { zh: "用人物、冲突与转折建立停留，再交付方法。", en: "Build retention through situation, tension, and discovery." },
    "information-dense": { zh: "结论先行，交付可保存的清单、流程或对比。", en: "Lead with the answer and deliver a reusable framework." },
    "visual-first": { zh: "减少文字，每页只表达一个三秒可懂的重点。", en: "Reduce copy so every page lands one idea in three seconds." }
  };
  return descriptions[strategy][locale];
}

function visualStoryFilename(platform: PlatformId, formatId: VisualStoryFormatId, page: number) {
  const date = new Date().toISOString().slice(0, 10);
  return `finfold-${platform}-${formatId}-${String(page).padStart(2, "0")}-${date}.png`;
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blobUrl = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(blobUrl);
}

const visualStoryCopy = {
  zh: {
    title: "生成完整图文组",
    coverAssets: "封面与素材",
    coverAssetsHint: "打开模板、Pexels、Pixabay、上传和 AI 图片",
    pages: "页",
    outputFormat: "输出尺寸",
    platformDefault: "平台默认",
    safeArea: "已预留界面安全区",
    officialSpec: "官方规格",
    industryReference: "行业推荐",
    specSource: "规格依据",
    pageCount: "目标页数",
    generate: "AI 重组图文",
    generating: "正在拆解内容…",
    generateFailed: "图文组生成失败，请重试。",
    generateOutOfCredits: "创作点数已用完，升级或等待下个周期重置后再试。",
    generateExisting: "上一次生成还在处理中，请稍候再试。",
    generateRateLimited: "生成过于频繁，请稍后再试。",
    generateTimeout: "生成超时，请重试。",
    loadFailed: "云端图文草稿加载失败，当前浏览器草稿仍可使用。",
    saveFailed: "图文草稿暂未同步到云端，请稍后重试。",
    exportFailed: "图片导出失败，请重试。",
    close: "关闭图文组工作台",
    visualSystem: "整组视觉",
    visualSystemHint: "一套主题贯穿所有页面",
    contentStrategy: "内容策略",
    quickLayout: "按原文排版",
    editPage: "编辑第",
    layout: "页面类型",
    kicker: "栏目标签",
    headline: "主标题",
    body: "正文",
    points: "清单内容",
    emphasis: "强调短句",
    onePointPerLine: "每行一个重点，最多 5 条。",
    exactText: "图片模型不参与文字渲染；导出文字与这里完全一致。",
    addPage: "添加一页",
    newPageKicker: "补充内容",
    newPageTitle: "输入这一页的重点",
    movePrevious: "向前移动这一页",
    moveNext: "向后移动这一页",
    deletePage: "删除这一页",
    downloadPage: "下载本页",
    downloadAll: "导出整组",
    downloadLocked: "升级后导出",
    browserSaved: "草稿自动保存在当前浏览器",
    cloudLoading: "正在读取内容包草稿…",
    cloudSaving: "正在保存到内容包…",
    cloudSaved: "已自动保存到内容包",
    cloudError: "云端同步暂时失败 · 本地草稿已保留",
    downloadPackage: "下载完整发布清单",
    packageLocked: "升级后下载发布清单",
    downloadAnimatedHtml: "动态 HTML",
    downloadMotionManifest: "视频渲染清单",
    motionLocked: "升级后导出",
    packageHint: "包含正文、技能策略、配图顺序、逐页文案与可插拔视频渲染清单"
  },
  en: {
    title: "Generate a complete visual story",
    coverAssets: "Cover & assets",
    coverAssetsHint: "Open templates, Pexels, Pixabay, uploads, and AI images",
    pages: "pages",
    outputFormat: "Output format",
    platformDefault: "Platform default",
    safeArea: "UI safe area applied",
    officialSpec: "Official",
    industryReference: "Industry guide",
    specSource: "Specification source",
    pageCount: "Target pages",
    generate: "AI storyboard",
    generating: "Structuring the story…",
    generateFailed: "Visual-story generation failed. Please try again.",
    generateOutOfCredits: "You're out of AI Credits for this cycle. Upgrade or wait for the next reset.",
    generateExisting: "The previous request is still processing. Please wait and try again.",
    generateRateLimited: "Too many requests. Please wait a moment and try again.",
    generateTimeout: "Generation timed out. Please try again.",
    loadFailed: "The cloud draft could not be loaded. Your browser draft is still available.",
    saveFailed: "The visual-story draft has not synced yet. Please try again shortly.",
    exportFailed: "Image export failed. Please try again.",
    close: "Close visual-story studio",
    visualSystem: "Visual system",
    visualSystemHint: "One theme across every page",
    contentStrategy: "Content strategy",
    quickLayout: "Layout source",
    editPage: "Edit page",
    layout: "Page type",
    kicker: "Kicker",
    headline: "Headline",
    body: "Body",
    points: "List points",
    emphasis: "Emphasis",
    onePointPerLine: "One point per line, up to five.",
    exactText: "The image model never renders copy; exported text matches these fields exactly.",
    addPage: "Add page",
    newPageKicker: "More context",
    newPageTitle: "Add this page's key idea",
    movePrevious: "Move page earlier",
    moveNext: "Move page later",
    deletePage: "Delete page",
    downloadPage: "Download page",
    downloadAll: "Export set",
    downloadLocked: "Upgrade to export",
    browserSaved: "Draft auto-saved in this browser",
    cloudLoading: "Loading content-kit draft…",
    cloudSaving: "Saving to content kit…",
    cloudSaved: "Auto-saved to content kit",
    cloudError: "Cloud sync paused · browser draft retained",
    downloadPackage: "Download publication manifest",
    packageLocked: "Upgrade to download manifest",
    downloadAnimatedHtml: "Animated HTML",
    downloadMotionManifest: "Render manifest",
    motionLocked: "Upgrade to export",
    packageHint: "Includes copy, skill strategy, assets, page copy, and a renderer-neutral motion manifest"
  }
} as const;

function saveStateLabel(state: CloudSaveState, copy: typeof visualStoryCopy.zh | typeof visualStoryCopy.en) {
  if (state === "loading") return copy.cloudLoading;
  if (state === "saving") return copy.cloudSaving;
  if (state === "saved") return copy.cloudSaved;
  if (state === "error") return copy.cloudError;
  return copy.browserSaved;
}
