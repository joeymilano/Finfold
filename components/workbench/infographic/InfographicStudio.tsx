"use client";

import React, { useMemo, useRef, useState } from "react";
import { BarChart3, Check, Download, Plus, X } from "@/components/ui/icons";
import type { KitOutput } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import type { CoverSizeId } from "@/lib/cover/cover-spec";
import { editorialThemes, swissAccents } from "@/lib/cover/cover-themes";
import { exportCoverPng } from "@/lib/cover/cover-export";
import { captureEvent } from "@/lib/posthog";
import { InfographicCanvas } from "@/components/workbench/infographic/InfographicCanvas";
import {
  defaultInfographicSpec,
  getInfographicLayout,
  getInfographicSize,
  infographicFilename,
  infographicLayouts,
  infographicSizeIds,
  type InfographicLayout,
  type InfographicSpec,
  type InfographicStyle
} from "@/lib/infographic/spec";

type Props = {
  output: KitOutput;
  locale: Locale;
  canExport?: boolean;
  onLockedExport?: () => void;
  onClose: () => void;
};

const PREVIEW_SCALE = 0.78;

export function InfographicStudio({ output, locale, canExport = true, onLockedExport, onClose }: Props) {
  const [spec, setSpec] = useState<InfographicSpec>(() => defaultInfographicSpec(output));
  const [sizeId, setSizeId] = useState<CoverSizeId>("xhs-3x4");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const zh = locale === "zh";

  const size = useMemo(() => getInfographicSize(sizeId), [sizeId]);
  const layoutOption = getInfographicLayout(spec.layout);
  const themes = spec.style === "swiss" ? swissAccents : editorialThemes;

  function patchSpec(patch: Partial<InfographicSpec>) {
    setSpec((prev) => ({ ...prev, ...patch }));
  }

  function switchLayout(layout: InfographicLayout) {
    const option = getInfographicLayout(layout);
    setSpec((prev) => {
      let items = prev.items;
      if (items.length > option.maxItems) items = items.slice(0, option.maxItems);
      while (items.length < option.minItems) items = [...items, { label: "" }];
      return { ...prev, layout, items };
    });
  }

  function switchStyle(style: InfographicStyle) {
    patchSpec({ style, themeId: style === "swiss" ? swissAccents[0].id : editorialThemes[0].id });
  }

  function updateItem(index: number, patch: Partial<InfographicSpec["items"][number]>) {
    setSpec((prev) => ({ ...prev, items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)) }));
  }

  function appendItem() {
    setSpec((prev) => (prev.items.length >= layoutOption.maxItems ? prev : { ...prev, items: [...prev.items, { label: "" }] }));
  }

  function removeItem(index: number) {
    setSpec((prev) => (prev.items.length <= layoutOption.minItems ? prev : { ...prev, items: prev.items.filter((_item, itemIndex) => itemIndex !== index) }));
  }

  async function exportPng() {
    if (!canExport) {
      onLockedExport?.();
      return;
    }
    if (!exportRef.current) return;
    setExporting(true);
    setExported(false);
    try {
      await exportCoverPng(exportRef.current, size, infographicFilename(sizeId));
      setExported(true);
      window.setTimeout(() => setExported(false), 1800);
      captureEvent("infographic_exported", { layout: spec.layout, style: spec.style, size_id: sizeId });
    } finally {
      setExporting(false);
    }
  }

  const inputClass = "focus-ring w-full rounded-lg border border-hairline bg-surface px-2.5 py-2 text-[11px] text-fg placeholder:text-fg-muted/60";

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="infographic-studio-title" className="fixed inset-0 z-50 flex items-center justify-center bg-fg/55 p-0 backdrop-blur-sm md:p-4">
      <div className="rk-enter flex h-dvh w-full max-w-[1280px] flex-col overflow-hidden border border-hairline bg-surface shadow-panel md:h-[calc(100vh-2rem)] md:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3 md:px-5">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/[0.12] text-brand"><BarChart3 className="h-4 w-4" /></span>
            <div>
              <h2 id="infographic-studio-title" className="text-sm font-bold text-fg">{zh ? "信息图工作室" : "Infographic studio"}</h2>
              <p className="text-[10px] text-fg-muted">{zh ? "布局 × 主题 · 文字全部由浏览器渲染" : "Layout × theme · every word browser-rendered"}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={zh ? "关闭" : "Close"} className="focus-ring rounded-lg p-2 text-fg-muted hover:bg-surface-2 hover:text-fg"><X className="h-4 w-4" /></button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-b border-hairline p-4 lg:border-b-0 lg:border-r lg:p-5">
            <section>
              <p className="eyebrow">{zh ? "布局" : "Layout"}</p>
              <div className="mt-3 grid grid-cols-3 gap-2" data-testid="infographic-layout-picker">
                {infographicLayouts.map((layout) => (
                  <button
                    key={layout.id}
                    type="button"
                    title={zh ? layout.hintZh : layout.hintEn}
                    aria-pressed={spec.layout === layout.id}
                    onClick={() => switchLayout(layout.id)}
                    className={`focus-ring rounded-xl border p-2 text-left ${spec.layout === layout.id ? "border-brand shadow-panel" : "border-hairline"}`}
                  >
                    <span className={`block h-1.5 w-8 rounded-full ${spec.layout === layout.id ? "bg-brand" : "bg-hairline"}`} />
                    <span className="mt-1.5 block text-[10px] font-bold text-fg">{zh ? layout.nameZh : layout.nameEn}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-5 border-t border-hairline pt-5">
              <p className="eyebrow">{zh ? "风格" : "Style"}</p>
              <div className="mt-3 flex gap-2">
                {(["editorial", "swiss"] as InfographicStyle[]).map((style) => (
                  <button
                    key={style}
                    type="button"
                    aria-pressed={spec.style === style}
                    onClick={() => switchStyle(style)}
                    className={`focus-ring flex-1 rounded-lg border px-3 py-2 text-[11px] font-bold ${spec.style === style ? "border-brand bg-brand/10 text-brand" : "border-hairline bg-surface-2 text-fg-muted hover:text-fg"}`}
                  >
                    {style === "editorial" ? (zh ? "刊物纸感" : "Editorial") : zh ? "瑞士网格" : "Swiss grid"}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    title={zh ? theme.nameZh : theme.nameEn}
                    aria-label={zh ? theme.nameZh : theme.nameEn}
                    aria-pressed={spec.themeId === theme.id}
                    onClick={() => patchSpec({ themeId: theme.id })}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${spec.themeId === theme.id ? "scale-110 border-fg" : "border-hairline"}`}
                    style={{ background: theme.accent }}
                  />
                ))}
              </div>
            </section>

            <section className="mt-5 grid gap-2 border-t border-hairline pt-5">
              <p className="eyebrow">{zh ? "内容" : "Content"}</p>
              <label className="grid gap-1 text-[10px] text-fg-muted">
                {zh ? "标题" : "Title"}
                <input className={inputClass} value={spec.title} onChange={(event) => patchSpec({ title: event.target.value })} />
              </label>
              <label className="grid gap-1 text-[10px] text-fg-muted">
                {zh ? "副标题" : "Subtitle"}
                <input className={inputClass} value={spec.subtitle} onChange={(event) => patchSpec({ subtitle: event.target.value })} />
              </label>
              {spec.layout === "comparison" ? (
                <p className="rounded-lg bg-surface-2 px-2.5 py-2 text-[9px] leading-4 text-fg-muted">{zh ? "前两条分别是左右两栏：数字填栏名，要点填说明" : "The first two items fill the two columns: value names the column, label describes it"}</p>
              ) : null}
              <div className="grid gap-2" data-testid="infographic-items-editor">
                {spec.items.map((item, index) => (
                  <div key={index} className="grid gap-1.5 rounded-lg border border-hairline bg-surface-2/60 p-2">
                    <div className="flex items-center gap-1.5">
                      <input className={inputClass} placeholder={zh ? "要点" : "Point"} value={item.label} onChange={(event) => updateItem(index, { label: event.target.value })} />
                      <button type="button" onClick={() => removeItem(index)} aria-label={zh ? `删除第 ${index + 1} 条` : `Remove item ${index + 1}`} className="focus-ring shrink-0 rounded-lg p-1.5 text-fg-muted hover:text-risk"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input className={inputClass} placeholder={zh ? "数字（可选）" : "Number (optional)"} value={item.value ?? ""} onChange={(event) => updateItem(index, { value: event.target.value })} />
                      <input className={inputClass} placeholder={zh ? "备注（可选）" : "Note (optional)"} value={item.note ?? ""} onChange={(event) => updateItem(index, { note: event.target.value })} />
                    </div>
                  </div>
                ))}
              </div>
              {spec.items.length < layoutOption.maxItems ? (
                <button type="button" onClick={appendItem} className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-hairline px-3 py-2 text-[10px] font-bold text-fg-muted hover:text-fg">
                  <Plus className="h-3.5 w-3.5" />{zh ? "添加一条" : "Add item"}
                </button>
              ) : null}
            </section>

            <section className="mt-5 border-t border-hairline pt-5">
              <p className="eyebrow">{zh ? "尺寸" : "Size"}</p>
              <div className="mt-3 flex gap-2">
                {infographicSizeIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={sizeId === id}
                    onClick={() => setSizeId(id)}
                    className={`focus-ring flex-1 rounded-lg border px-3 py-2 text-[10px] font-bold ${sizeId === id ? "border-brand bg-brand/10 text-brand" : "border-hairline bg-surface-2 text-fg-muted hover:text-fg"}`}
                  >
                    {id === "xhs-3x4" ? "1080×1440 · 3:4" : "1080×1080 · 1:1"}
                  </button>
                ))}
              </div>
            </section>

            <button type="button" onClick={() => void exportPng()} disabled={exporting} className="btn-primary focus-ring mt-5 flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-xs disabled:opacity-60">
              {exported ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
              {!canExport ? (zh ? "升级后导出" : "Upgrade to export") : exporting ? (zh ? "正在导出" : "Exporting") : exported ? (zh ? "已导出" : "Exported") : zh ? "导出 PNG" : "Export PNG"}
            </button>
          </aside>

          <main className="min-h-0 overflow-auto bg-surface-2 p-4 md:p-8">
            <div className="flex justify-center">
              <div style={{ width: size.cssWidth * PREVIEW_SCALE, height: size.cssHeight * PREVIEW_SCALE }} className="overflow-hidden rounded-2xl border border-hairline bg-white shadow-raised" data-testid="infographic-preview">
                <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left" }}>
                  <InfographicCanvas spec={spec} size={size} sizeId={sizeId} />
                </div>
              </div>
            </div>
          </main>
        </div>

        {/* Off-screen full-size node captured for export; kept free of transforms. */}
        <div aria-hidden style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none" }}>
          <div ref={exportRef}>
            <InfographicCanvas spec={spec} size={size} sizeId={sizeId} />
          </div>
        </div>
      </div>
    </div>
  );
}
