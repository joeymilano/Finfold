"use client";

import { Check, Download, History, Image as ImageIcon, Loader2, RotateCcw, Sparkles, X } from "@/components/ui/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ArticleIllustrationBrief, ArticleIllustrationPlan } from "@/lib/article-illustrations";
import type { KitOutput } from "@/lib/content-schema";
import type { VisualAsset } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import type { PlatformId } from "@/lib/platforms";
import type { VisualIntelligencePlan } from "@/lib/visual-intelligence";
import { visualStoryThemes } from "@/lib/visual-story";

type Props = {
  output: KitOutput;
  platform: PlatformId;
  locale: Locale;
  visualPlan: VisualIntelligencePlan;
  illustrationPlan: ArticleIllustrationPlan;
  referenceImageUrl?: string;
  kitId?: string;
  onAssetsChanged?: (assets: VisualAsset[]) => void;
  onClose: () => void;
};

type GeneratedIllustrations = Record<string, string>;

export function ArticleIllustrationStudio({ output, platform, locale, visualPlan, illustrationPlan, referenceImageUrl, kitId, onAssetsChanged, onClose }: Props) {
  const theme = visualStoryThemes[visualPlan.theme];
  const storageKey = `finfold:article-illustrations:${output.id || `${platform}:${output.title}`}`;
  const [activeId, setActiveId] = useState(illustrationPlan.briefs[0]?.id ?? "");
  const [generated, setGenerated] = useState<GeneratedIllustrations>(() => generatedFromAssets(output.visualAssets, illustrationPlan));
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [historyAssets, setHistoryAssets] = useState<VisualAsset[]>(output.visualAssets ?? []);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const persistedAssetsRef = useRef<VisualAsset[]>(output.visualAssets ?? []);
  const activeBrief = illustrationPlan.briefs.find((brief) => brief.id === activeId) ?? illustrationPlan.briefs[0];
  const activePosition = Math.max(0, illustrationPlan.briefs.findIndex((brief) => brief.id === activeBrief?.id));
  const activeVersions = useMemo(
    () => historyAssets.filter((asset) => asset.positionIndex === activePosition).sort((a, b) => (b.revision ?? 1) - (a.revision ?? 1)),
    [activePosition, historyAssets]
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setGenerated((current) => ({ ...current, ...JSON.parse(saved) as GeneratedIllustrations }));
    } catch {
      // A damaged browser draft should not block a new illustration plan.
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(generated));
    } catch {
      // Generation and preview remain usable when browser storage is blocked.
    }
  }, [generated, storageKey]);

  useEffect(() => {
    if (!kitId || !output.id) return;
    const controller = new AbortController();
    void fetch(`/api/kits/${kitId}/outputs/${output.id}/visual-assets`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { assets?: VisualAsset[]; error?: string };
        if (!response.ok) throw new Error(data.error || (locale === "en" ? "Image history could not be loaded." : "配图历史版本加载失败。"));
        const assets = data.assets ?? [];
        setHistoryAssets(assets);
        const currentAssets = assets.filter((asset) => asset.isCurrent);
        if (currentAssets.length > 0) {
          persistedAssetsRef.current = currentAssets;
          setGenerated(generatedFromAssets(currentAssets, illustrationPlan));
        }
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : locale === "en" ? "Image history could not be loaded." : "配图历史版本加载失败。");
      });
    return () => controller.abort();
  }, [illustrationPlan, kitId, locale, output.id]);

  const completedCount = useMemo(
    () => illustrationPlan.briefs.filter((brief) => generated[brief.id]).length,
    [generated, illustrationPlan.briefs]
  );

  async function generateBrief(brief: ArticleIllustrationBrief): Promise<void> {
    setGeneratingId(brief.id);
    setError(null);
    try {
      const response = await fetch("/api/image/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({
          prompt: brief.prompt,
          platform,
          size: brief.size,
          referenceImageUrl
        })
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || (locale === "en" ? "Image generation failed." : "配图生成失败。"));
      let imageUrl = data.url;
      setGenerated((current) => ({ ...current, [brief.id]: imageUrl }));

      if (kitId && output.id) {
        const positionIndex = Math.max(0, illustrationPlan.briefs.findIndex((item) => item.id === brief.id));
        const saveResponse = await fetch(`/api/kits/${kitId}/outputs/${output.id}/visual-assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            remoteImageUrl: imageUrl,
            positionIndex,
            role: brief.role,
            sourceExcerpt: brief.sourceExcerpt,
            placementHint: brief.placementHint,
            prompt: brief.prompt,
            altText: brief.altText,
            metadata: {
              theme: visualPlan.theme,
              brandAligned: visualPlan.brandAligned,
              referenceUsed: Boolean(referenceImageUrl),
              format: "landscape-16x9"
            }
          })
        });
        const savedData = (await saveResponse.json()) as { asset?: VisualAsset; error?: string };
        if (!saveResponse.ok || !savedData.asset) {
          throw new Error(savedData.error || (locale === "en" ? "Image generated, but it could not be saved to this content kit." : "图片已生成，但未能保存到这个内容包。"));
        }
        imageUrl = savedData.asset.imageUrl;
        setGenerated((current) => ({ ...current, [brief.id]: imageUrl }));
        const nextAssets = [
          ...persistedAssetsRef.current.filter((asset) => !(asset.assetType === savedData.asset!.assetType && asset.positionIndex === savedData.asset!.positionIndex)),
          savedData.asset
        ].sort((a, b) => a.positionIndex - b.positionIndex);
        persistedAssetsRef.current = nextAssets;
        setHistoryAssets((current) => [
          savedData.asset!,
          ...current.map((asset) => asset.positionIndex === savedData.asset!.positionIndex ? { ...asset, isCurrent: false } : asset)
        ]);
        onAssetsChanged?.(nextAssets);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : locale === "en" ? "Image generation failed." : "配图生成失败。");
      throw caught;
    } finally {
      setGeneratingId(null);
    }
  }

  async function generateAll() {
    setGeneratingAll(true);
    setError(null);
    try {
      for (const brief of illustrationPlan.briefs) {
        if (!generated[brief.id]) await generateBrief(brief);
      }
    } catch {
      // The first failed brief remains selected with an actionable error.
    } finally {
      setGeneratingAll(false);
    }
  }

  async function restoreVersion(asset: VisualAsset) {
    if (!kitId || !output.id || !asset.id || asset.isCurrent) return;
    setRestoringId(asset.id);
    setError(null);
    try {
      const response = await fetch(`/api/kits/${kitId}/outputs/${output.id}/visual-assets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id })
      });
      const data = await response.json() as { asset?: VisualAsset; error?: string };
      if (!response.ok || !data.asset) throw new Error(data.error || (locale === "en" ? "This image version could not be restored." : "这个配图版本恢复失败。"));
      const restored = data.asset;
      setHistoryAssets((current) => current.map((item) => item.positionIndex === restored.positionIndex ? { ...item, isCurrent: item.id === restored.id } : item));
      setGenerated((current) => ({ ...current, [activeBrief.id]: restored.imageUrl }));
      const nextAssets = [
        ...persistedAssetsRef.current.filter((item) => item.positionIndex !== restored.positionIndex),
        restored
      ].sort((a, b) => a.positionIndex - b.positionIndex);
      persistedAssetsRef.current = nextAssets;
      onAssetsChanged?.(nextAssets);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : locale === "en" ? "This image version could not be restored." : "这个配图版本恢复失败。");
    } finally {
      setRestoringId(null);
    }
  }

  if (!activeBrief) return null;
  const activeImage = generated[activeBrief.id];

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="article-illustrations-title" className="fixed inset-0 z-50 flex items-center justify-center bg-fg/55 p-0 backdrop-blur-sm md:p-4">
      <div className="rk-enter flex h-dvh w-full max-w-[1180px] flex-col overflow-hidden border border-hairline bg-surface shadow-panel md:h-[calc(100vh-2rem)] md:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3.5 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-action/[0.1] text-action-strong dark:text-action"><ImageIcon className="h-4 w-4" /></span>
            <div className="min-w-0">
              <h2 id="article-illustrations-title" className="truncate text-sm font-black text-fg">{locale === "en" ? "Article visual package" : "文章视觉资产包"}</h2>
              <p className="truncate text-[11px] text-fg-muted">
                {locale === "en"
                  ? `${illustrationPlan.briefs.length} evidence-bound placements · ${completedCount} generated`
                  : `${illustrationPlan.briefs.length} 个原文配图位 · 已生成 ${completedCount} 个`}
              </p>
              <p className="mt-0.5 truncate text-[9px] font-semibold text-positive">{kitId ? locale === "en" ? "Generated images are saved to this content kit" : "生成后自动保存到当前内容包" : locale === "en" ? "Drafts are saved in this browser" : "当前草稿保存在本浏览器"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void generateAll()} disabled={generatingAll || generatingId !== null || completedCount === illustrationPlan.briefs.length} className="btn-primary focus-ring px-3 py-2 text-xs disabled:opacity-55">
              {generatingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {generatingAll ? locale === "en" ? "Generating package…" : "正在生成整组…" : locale === "en" ? "Generate all" : "生成整组配图"}
            </button>
            <button type="button" onClick={onClose} aria-label={locale === "en" ? "Close" : "关闭"} className="focus-ring rounded-lg p-2 text-fg-muted hover:bg-surface-2 hover:text-fg"><X className="h-4 w-4" /></button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="order-2 flex gap-2 overflow-x-auto border-t border-hairline bg-surface-2/35 p-3 md:order-1 md:block md:overflow-y-auto md:border-r md:border-t-0">
            {illustrationPlan.briefs.map((brief) => {
              const active = brief.id === activeBrief.id;
              const ready = Boolean(generated[brief.id]);
              return (
                <button key={brief.id} type="button" onClick={() => setActiveId(brief.id)} className={`focus-ring mb-2 min-w-[230px] rounded-xl border p-3 text-left transition md:min-w-0 md:w-full ${active ? "border-action bg-action/[0.07] shadow-panel" : "border-hairline bg-surface hover:border-action/35"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wide text-fg">{brief.label}</span>
                    {ready ? <span className="inline-flex items-center gap-1 text-[9px] font-bold text-positive"><Check className="h-3 w-3" />{locale === "en" ? "Ready" : "已生成"}</span> : null}
                  </div>
                  <p className="mt-2 line-clamp-3 text-[11px] leading-4 text-fg-muted">{brief.sourceExcerpt}</p>
                </button>
              );
            })}
          </aside>

          <main className="order-1 min-h-0 overflow-y-auto p-4 md:order-2 md:p-6 lg:p-8">
            <div className="mx-auto max-w-[760px]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="eyebrow">{activeBrief.label}</p>
                  <p className="mt-1 text-xs font-semibold text-fg-muted">{activeBrief.placementHint}</p>
                </div>
                <span className="rounded-full border border-hairline bg-surface-2 px-2.5 py-1 text-[9px] font-bold text-fg-muted">1344×768 · 16:9</span>
              </div>

              <div className="relative aspect-video overflow-hidden rounded-2xl border border-hairline shadow-raised" style={{ background: theme.paper }}>
                {activeImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activeImage} alt={activeBrief.altText} className="h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 grid place-items-center p-8" style={{ color: theme.ink }}>
                    <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at 72% 18%, ${theme.accent}66, transparent 34%), linear-gradient(135deg, transparent, ${theme.soft})` }} />
                    <div className="relative max-w-md text-center">
                      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl" style={{ background: theme.soft, color: theme.accent }}><ImageIcon className="h-5 w-5" /></span>
                      <p className="mt-4 text-sm font-black">{locale === "en" ? "Placement and art direction are ready" : "配图位置与视觉方向已就绪"}</p>
                      <p className="mt-2 text-xs leading-5 opacity-65">{activeBrief.sourceExcerpt}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3 rounded-xl border border-hairline bg-surface-2/45 p-3.5 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-fg-muted">{locale === "en" ? "Shared art direction" : "整组统一视觉方向"}</p>
                  <p className="mt-1.5 text-[11px] leading-5 text-fg-muted">{illustrationPlan.continuityDirection}</p>
                </div>
                <button type="button" onClick={() => void generateBrief(activeBrief)} disabled={generatingId !== null || generatingAll} className="btn-primary focus-ring justify-center px-3 py-2.5 text-xs disabled:opacity-55">
                  {generatingId === activeBrief.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {generatingId === activeBrief.id ? locale === "en" ? "Generating…" : "正在生成…" : activeImage ? locale === "en" ? "Regenerate" : "重新生成" : locale === "en" ? "Generate this image" : "生成这张配图"}
                </button>
              </div>

              {activeVersions.length > 1 ? (
                <section className="mt-3 rounded-xl border border-hairline bg-surface p-3" aria-label={locale === "en" ? "Image version history" : "配图历史版本"}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-fg-muted"><History className="h-3.5 w-3.5" />{locale === "en" ? `${activeVersions.length} saved versions` : `已保留 ${activeVersions.length} 个版本`}</p>
                    <span className="text-[9px] text-fg-muted">{locale === "en" ? "Regeneration never deletes the previous image" : "重新生成不会删除旧图"}</span>
                  </div>
                  <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
                    {activeVersions.map((asset) => (
                      <div key={asset.id || `${asset.positionIndex}-${asset.revision}`} className={`w-28 shrink-0 overflow-hidden rounded-lg border ${asset.isCurrent ? "border-action bg-action/[0.06]" : "border-hairline bg-surface-2"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={asset.imageUrl} alt={asset.altText} className="aspect-video w-full object-cover" />
                        <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                          <span className="text-[9px] font-bold text-fg">v{asset.revision ?? 1}</span>
                          {asset.isCurrent ? <span className="text-[8px] font-bold text-positive">{locale === "en" ? "Current" : "当前"}</span> : (
                            <button type="button" onClick={() => void restoreVersion(asset)} disabled={restoringId !== null} className="focus-ring inline-flex items-center gap-0.5 rounded text-[8px] font-bold text-action-strong disabled:opacity-50 dark:text-action">
                              {restoringId === asset.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RotateCcw className="h-2.5 w-2.5" />}{locale === "en" ? "Restore" : "恢复"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {error ? <p role="alert" className="mt-3 rounded-lg border border-risk/25 bg-risk/10 px-3 py-2 text-xs text-risk">{error}</p> : null}
              {activeImage ? (
                <a href={activeImage} target="_blank" rel="noreferrer" className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold text-action-strong hover:bg-action/[0.05] dark:text-action">
                  <Download className="h-3.5 w-3.5" />{locale === "en" ? "Open original image" : "打开原图"}
                </a>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function generatedFromAssets(assets: VisualAsset[] | undefined, plan: ArticleIllustrationPlan): GeneratedIllustrations {
  return Object.fromEntries(
    (assets ?? [])
      .filter((asset) => asset.assetType === "article_illustration" && plan.briefs[asset.positionIndex])
      .map((asset) => [plan.briefs[asset.positionIndex].id, asset.imageUrl])
  );
}
