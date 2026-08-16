"use client";

import React, { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, ImageIcon, Loader2, Search, ShieldCheck } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n";
import { assetSourceNotes } from "@/lib/ops-data";
import {
  coverAssetAttribution,
  stockPresetLabel,
  stockProviderName,
  stockSearchPresets,
  type CoverAsset,
  type StockProvider
} from "@/lib/cover/stock-assets";

type CommercialAssetLibraryProps = {
  locale: Locale;
};

export function CommercialAssetLibrary({ locale }: CommercialAssetLibraryProps) {
  const [opened, setOpened] = useState(false);
  const [provider, setProvider] = useState<StockProvider>("pexels");
  const [query, setQuery] = useState("");
  const [activePreset, setActivePreset] = useState("curated");
  const [assets, setAssets] = useState<CoverAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const copy = locale === "en" ? {
    eyebrow: "Visual resources",
    title: "Commercial-use library & licenses",
    desc: "Browse real stock photography here; open license records only when you need to verify a source.",
    collapsedMeta: "Pexels · Pixabay · license records",
    libraryTitle: "Real photo library",
    libraryDesc: "The same licensed sources used in the Workbench cover studio.",
    searchPlaceholder: "Search photos",
    search: "Search",
    unavailable: "The photo library is not available right now.",
    retry: "Try again",
    openSource: "Open original",
    useInWorkbench: "Use in Workbench",
    licenseNotes: "Commercial license records",
    licenseNotesDesc: `${assetSourceNotes.length} approved sources and tools`,
    viewSource: "View source",
    license: "License"
  } : {
    eyebrow: "视觉资源",
    title: "商用图库与许可",
    desc: "在这里浏览真实图库；只有需要核验来源时，再展开授权记录。",
    collapsedMeta: "Pexels · Pixabay · 授权记录",
    libraryTitle: "真实图库",
    libraryDesc: "与创作台封面工作室共用同一套可商用素材来源。",
    searchPlaceholder: "搜索图片",
    search: "搜索",
    unavailable: "图库暂时不可用。",
    retry: "重试",
    openSource: "查看原图",
    useInWorkbench: "去创作台使用",
    licenseNotes: "商用授权说明",
    licenseNotesDesc: `${assetSourceNotes.length} 个已核验来源与工具`,
    viewSource: "查看来源",
    license: "许可"
  };

  const loadPhotos = useCallback(async (nextQuery: string, nextProvider: StockProvider) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ orientation: "landscape", lang: locale });
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      const response = await fetch(`/api/stock/${nextProvider}?${params.toString()}`);
      const data = (await response.json()) as { assets?: CoverAsset[]; error?: string; configured?: boolean };
      if (!response.ok || data.configured === false) {
        throw new Error(data.error || copy.unavailable);
      }
      if (requestId === requestIdRef.current) setAssets(data.assets ?? []);
    } catch (caught) {
      if (requestId === requestIdRef.current) {
        setAssets([]);
        setError(caught instanceof Error ? caught.message : copy.unavailable);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [copy.unavailable, locale]);

  function openLibrary() {
    if (opened) return;
    setOpened(true);
    if (assets.length === 0 && !loading && !error) void loadPhotos("", provider);
  }

  return (
    <details
      className="panel group overflow-hidden"
      onToggle={(event) => {
        if (event.currentTarget.open) openLibrary();
        else setOpened(false);
      }}
    >
      <summary className="focus-ring flex cursor-pointer list-none items-center gap-3 p-4 md:px-5 [&::-webkit-details-marker]:hidden">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
          <ImageIcon className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow">{copy.eyebrow}</span>
          <span className="mt-1 block text-sm font-black text-fg">{copy.title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-fg-muted">{copy.desc}</span>
        </span>
        <span className="hidden rounded-full border border-hairline bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-fg-muted lg:inline">
          {copy.collapsedMeta}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-hairline p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-sm font-black text-fg">{copy.libraryTitle}</h2>
            <p className="mt-1 text-xs text-fg-muted">{copy.libraryDesc}</p>
          </div>
          <Link href="/workbench" className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-2 text-xs font-bold text-fg hover:border-brand/40">
            {copy.useInWorkbench} <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="flex rounded-lg border border-hairline bg-surface-2/60 p-1" role="group" aria-label={locale === "en" ? "Photo source" : "图库来源"}>
              {(["pexels", "pixabay"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={provider === option}
                  onClick={() => {
                    if (provider === option) return;
                    setProvider(option);
                    setAssets([]);
                    setActivePreset(query.trim() ? "custom" : "curated");
                    void loadPhotos(query, option);
                  }}
                  className={`focus-ring flex-1 rounded-md px-2 py-2 text-[11px] font-bold transition-colors ${provider === option ? "bg-surface text-fg shadow-panel" : "text-fg-muted hover:text-fg"}`}
                >
                  {stockProviderName(option)}
                </button>
              ))}
            </div>

            <form
              className="relative"
              onSubmit={(event) => {
                event.preventDefault();
                setActivePreset("custom");
                void loadPhotos(query, provider);
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
                maxLength={80}
                className="field-input h-10 w-full pl-9 pr-16 text-xs"
              />
              <button type="submit" className="focus-ring absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-fg px-2.5 py-1.5 text-[10px] font-bold text-surface">
                {copy.search}
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5">
              {stockSearchPresets.slice(0, 6).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setActivePreset(preset.id);
                    setQuery(preset.query);
                    void loadPhotos(preset.query, provider);
                  }}
                  className={`focus-ring rounded-full px-2.5 py-1 text-[10px] font-semibold ${activePreset === preset.id ? "bg-brand/15 text-brand" : "bg-surface-2 text-fg-muted hover:text-fg"}`}
                >
                  {stockPresetLabel(preset, locale)}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-44 rounded-xl border border-hairline bg-surface-2/35 p-2">
            {loading ? (
              <div className="grid h-40 place-items-center text-fg-muted"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : error ? (
              <div className="grid h-40 place-items-center px-6 text-center">
                <div>
                  <p className="text-xs font-bold text-fg">{copy.unavailable}</p>
                  <p className="mt-1 max-w-md text-[11px] leading-5 text-fg-muted">{error}</p>
                  <button type="button" onClick={() => void loadPhotos(query, provider)} className="focus-ring mt-2 rounded-md px-2 py-1 text-xs font-bold text-brand">{copy.retry}</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {assets.slice(0, 8).map((asset) => (
                  <a
                    key={asset.id}
                    href={asset.sourceUrl || asset.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`${copy.openSource} · ${coverAssetAttribution(asset, locale)}`}
                    className="focus-ring group relative aspect-[4/3] overflow-hidden rounded-lg bg-surface"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.previewUrl} alt={asset.alt} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                    <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-7 text-[9px] text-white">
                      <span className="truncate">{asset.photographer || stockProviderName(provider)}</span>
                      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <details className="group/licenses mt-4 rounded-xl border border-hairline bg-surface-2/30">
          <summary className="focus-ring flex cursor-pointer list-none items-center gap-3 p-3.5 [&::-webkit-details-marker]:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10 text-brand"><ShieldCheck className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-black text-fg">{copy.licenseNotes}</span>
              <span className="mt-0.5 block text-[10px] text-fg-muted">{copy.licenseNotesDesc}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-fg-muted transition-transform group-open/licenses:rotate-180" />
          </summary>
          <div className="grid gap-2 border-t border-hairline p-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {assetSourceNotes.map((source) => (
              <a key={source.source} href={source.href} target="_blank" rel="noreferrer" className="rounded-lg border border-hairline bg-surface p-3 transition-colors hover:border-brand/35">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-fg">{source.source}</span>
                  <ExternalLink className="h-3 w-3 text-fg-muted" />
                </div>
                <p className="mt-1 text-[10px] leading-4 text-fg-muted">{source.use}</p>
                <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2 text-[9px] font-bold uppercase tracking-wide text-brand">
                  <span>{copy.license}</span>
                  <span>{source.license}</span>
                </div>
              </a>
            ))}
          </div>
        </details>
      </div>
    </details>
  );
}
