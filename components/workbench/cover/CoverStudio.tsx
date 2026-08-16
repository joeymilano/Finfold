"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  ExternalLink,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Search,
  Save,
  ShieldAlert,
  ShieldCheck,
  Upload,
  WandSparkles,
  X
} from "@/components/ui/icons";
import type { KitOutput } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import { ACTION_CREDITS } from "@/lib/payment/types";
import { getPlatform, type PlatformId } from "@/lib/platforms";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import {
  coverSizes,
  defaultCoverConfig,
  getPlatformCoverSpec,
  isWechatPair,
  type CoverConfig,
  type CoverSizeId,
  type CoverStyle
} from "@/lib/cover/cover-spec";
import { editorialThemes, swissAccents } from "@/lib/cover/cover-themes";
import {
  coverTemplateCategories,
  coverTemplates,
  getTemplatesByCategory,
  type CoverTemplate,
  type CoverTemplateCategory
} from "@/lib/cover/templates";
import {
  coverAssetAttribution,
  stockPresetLabel,
  stockSearchPresets,
  stockProviderName,
  type CoverAsset,
  type StockProvider
} from "@/lib/cover/stock-assets";
import { deriveShortTitle } from "@/lib/cover/short-title";
import { formatCoverDisplayTitle } from "@/lib/cover/display-title";
import { coverFilename, exportCoverPng, exportCoverPngToDataUrl, exportStageWeights, type ExportProgressStage } from "@/lib/cover/cover-export";
import { CoverCanvas } from "@/components/workbench/cover/CoverCanvas";
import { buildVisualIdentityPrompt, type BrandBrain } from "@/lib/brand-brain";
import { inspectImageCompliance } from "@/lib/image-compliance-client";
import { captureEvent } from "@/lib/posthog";

type CoverStudioProps = {
  output: KitOutput;
  platform: PlatformId;
  locale: Locale;
  kitId?: string;
  canExport?: boolean;
  onLockedExport?: () => void;
  onClose: () => void;
  onSaveCover?: (imageUrl: string) => void;
  brandBrain?: BrandBrain;
  referenceImageUrl?: string;
};

// Rough wall-clock estimate per size — font warm-up + double-capture on a
// 1080-2100px canvas. Used only to drive the progress bar's pacing, not a hard cap.
const ESTIMATED_MS_PER_SIZE = 2600;

type StudioPanel = "templates" | "photos" | "upload" | "ai";
type MobileStudioStep = "template" | "visual" | "text";

export function CoverStudio({ output, platform, locale, kitId, canExport = true, onLockedExport, onClose, onSaveCover, brandBrain, referenceImageUrl }: CoverStudioProps) {
  const platformInfo = getPlatform(platform);
  const spec = getPlatformCoverSpec(platform);
  const pair = isWechatPair(platform);

  const [config, setConfig] = useState<CoverConfig>(() => defaultCoverConfig(platform, output));
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState<ExportProgressStage | null>(null);
  const [activeSizeIndex, setActiveSizeIndex] = useState(0);
  const [savingCover, setSavingCover] = useState(false);
  const [coverSaved, setCoverSaved] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [complianceChecking, setComplianceChecking] = useState(false);
  const [qrRiskDetected, setQrRiskDetected] = useState(false);
  const [qrRiskAcknowledged, setQrRiskAcknowledged] = useState(false);
  const [activePanel, setActivePanel] = useState<StudioPanel>("templates");
  const [mobileStep, setMobileStep] = useState<MobileStudioStep>("template");
  const [isMobile, setIsMobile] = useState(false);
  const [templateCategory, setTemplateCategory] = useState<CoverTemplateCategory>("insight");
  const [selectedTemplateId, setSelectedTemplateId] = useState("insight-ink");
  const [selectedAsset, setSelectedAsset] = useState<CoverAsset | null>(() =>
    output.imageUrl
      ? {
          id: "existing-cover",
          url: output.imageUrl,
          previewUrl: output.imageUrl,
          width: 0,
          height: 0,
          alt: "",
          provider: "existing",
          licenseName: "Existing cover",
          attributionRequired: false
        }
      : null
  );
  const [stockAssets, setStockAssets] = useState<CoverAsset[]>([]);
  const [stockProvider, setStockProvider] = useState<StockProvider>("pexels");
  const [stockQuery, setStockQuery] = useState("");
  const [activePreset, setActivePreset] = useState("curated");
  const [stockLoading, setStockLoading] = useState(false);
  const [stockCachingId, setStockCachingId] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState(() => buildRecommendedAiPrompt(output, brandBrain));
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [coverCopy, setCoverCopy] = useState(() => ({
    title: formatCoverDisplayTitle(output.title, platform),
    highlight: output.cta,
    kicker: platformInfo.label
  }));

  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadObjectUrlRef = useRef<string | null>(null);
  const stockRequestRef = useRef(0);

  useEffect(() => {
    setConfig(defaultCoverConfig(platform, output));
    setMobileStep("template");
    setActivePanel("templates");
    setCoverCopy({ title: formatCoverDisplayTitle(output.title, platform), highlight: output.cta, kicker: platformInfo.label });
    setAiPrompt(buildRecommendedAiPrompt(output, brandBrain));
    setQrRiskDetected(false);
    setQrRiskAcknowledged(false);
    setSelectedAsset(
      output.imageUrl
        ? {
            id: "existing-cover",
            url: output.imageUrl,
            previewUrl: output.imageUrl,
            width: 0,
            height: 0,
            alt: "",
            provider: "existing",
            licenseName: "Existing cover",
            attributionRequired: false
          }
        : null
    );
  }, [brandBrain, platform, platformInfo.label, output]);

  useEffect(() => () => {
    if (uploadObjectUrlRef.current) URL.revokeObjectURL(uploadObjectUrlRef.current);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !exporting) onClose();
    }

    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [exporting, onClose]);

  const themes = config.style === "swiss" ? swissAccents : editorialThemes;
  const previewSizeId = spec.sizes[activeSizeIndex] ?? spec.sizes[0];
  const previewOutput = { ...output, imageUrl: selectedAsset?.url ?? "" };

  const estimatedSeconds = useMemo(
    () => Math.ceil((spec.sizes.length * ESTIMATED_MS_PER_SIZE) / 1000),
    [spec.sizes.length]
  );

  function switchStyle(style: CoverStyle) {
    setConfig((prev) => ({
      ...prev,
      style,
      themeId: style === "swiss" ? swissAccents[0].id : style === "photo" ? "midnight-ink" : editorialThemes[0].id
    }));
  }

  function applyTemplate(template: CoverTemplate) {
    setSelectedTemplateId(template.id);
    switchStyle(template.style);
    setConfig((previous) => ({
      ...previous,
      style: template.style,
      themeId: template.themeId
    }));
    if (template.style === "photo" && !selectedAsset) {
      setActivePanel("photos");
      if (isMobile) setMobileStep("visual");
    }
  }

  const loadStockPhotos = useCallback(async (query: string, provider = stockProvider) => {
    const requestId = ++stockRequestRef.current;
    setStockLoading(true);
    setStockError(null);
    try {
      const size = coverSizes[previewSizeId];
      const orientation = size.width === size.height ? "square" : size.height > size.width ? "portrait" : "landscape";
      const params = new URLSearchParams({ orientation, lang: locale });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/stock/${provider}?${params.toString()}`);
      const data = (await response.json()) as { assets?: CoverAsset[]; error?: string; configured?: boolean };
      if (!response.ok || data.configured === false) {
        throw new Error(
          data.configured === false
            ? locale === "en"
              ? `Connect the ${stockProviderName(provider)} library in settings before searching photos.`
              : `图库尚未连接，请先在部署设置中配置 ${stockProviderName(provider)}。`
            : data.error || "Stock photo search failed."
        );
      }
      if (requestId === stockRequestRef.current) setStockAssets(data.assets ?? []);
    } catch (caught) {
      if (requestId === stockRequestRef.current) {
        setStockAssets([]);
        setStockError(caught instanceof Error ? caught.message : "Stock photo search failed.");
      }
    } finally {
      if (requestId === stockRequestRef.current) setStockLoading(false);
    }
  }, [locale, previewSizeId, stockProvider]);

  useEffect(() => {
    if (activePanel === "photos" && stockAssets.length === 0 && !stockLoading && !stockError) {
      void loadStockPhotos("");
    }
  }, [activePanel, loadStockPhotos, stockAssets.length, stockError, stockLoading]);

  function applyChosenAsset(asset: CoverAsset) {
    setSelectedAsset(asset);
    switchStyle("photo");
    setCoverSaved(false);
    if (isMobile) setMobileStep("text");
  }

  async function cacheStockAsset(asset: CoverAsset): Promise<CoverAsset> {
    const provider = asset.provider;
    if (provider !== "pixabay" && provider !== "pexels") return asset;

    const id = asset.id.replace(new RegExp(`^${provider}-`), "");
    const response = await fetch(`/api/stock/${provider}/cache`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = (await response.json()) as { asset?: CoverAsset; error?: string };
    if (!response.ok || !data.asset) throw new Error(data.error || "Unable to prepare this image for export.");
    return data.asset;
  }

  async function chooseAsset(asset: CoverAsset) {
    if (asset.provider !== "upload") {
      setQrRiskDetected(false);
      setQrRiskAcknowledged(false);
    }
    if (asset.provider !== "pixabay" && asset.provider !== "pexels") {
      applyChosenAsset(asset);
      return;
    }

    setStockCachingId(asset.id);
    setStockError(null);
    try {
      applyChosenAsset(await cacheStockAsset(asset));
    } catch (caught) {
      setStockError(caught instanceof Error ? caught.message : "Unable to prepare this image for export.");
    } finally {
      setStockCachingId(null);
    }
  }

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setCoverError(locale === "en" ? "Choose a JPG, PNG, or WebP image." : "请选择 JPG、PNG 或 WebP 图片。");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setCoverError(locale === "en" ? "The image must be smaller than 15MB." : "图片需小于 15MB。");
      return;
    }
    if (uploadObjectUrlRef.current) URL.revokeObjectURL(uploadObjectUrlRef.current);
    const url = URL.createObjectURL(file);
    uploadObjectUrlRef.current = url;
    void chooseAsset({
      id: `upload-${file.name}-${file.lastModified}`,
      url,
      previewUrl: url,
      width: 0,
      height: 0,
      alt: file.name,
      provider: "upload",
      licenseName: "User supplied",
      attributionRequired: false
    });
    setCoverError(null);
    setQrRiskAcknowledged(false);
    if (platform === "xiaohongshu") {
      setComplianceChecking(true);
      const compliance = await inspectImageCompliance(file);
      setComplianceChecking(false);
      const detected = compliance.qrCode === "detected";
      setQrRiskDetected(detected);
      captureEvent("xhs_cover_compliance_checked", {
        source: "upload",
        qrRisk: detected,
        unavailable: compliance.qrCode === "unavailable"
      });
      if (detected) setCoverError(coverStudioCopy[locale].xhsQrBlocked);
    } else {
      setQrRiskDetected(false);
    }
  }

  async function generateAiVisual() {
    const prompt = aiPrompt.trim();
    if (!prompt) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const size = coverSizes[previewSizeId];
      const apiSize = size.height > size.width ? "768x1344" : size.width > size.height ? "1344x768" : "1024x1024";
      const response = await fetch("/api/image/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({
          prompt,
          platform,
          size: apiSize,
          referenceImageUrl: referenceImageUrl || brandBrain?.visualIdentity.referenceImageUrls[0] || output.imageUrl || undefined
        })
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "Image generation failed.");
      chooseAsset({
        id: `ai-${Date.now()}`,
        url: data.url,
        previewUrl: data.url,
        width: 0,
        height: 0,
        alt: prompt,
        provider: "ai",
        licenseName: "AI generated",
        attributionRequired: false
      });
    } catch (caught) {
      setAiError(caught instanceof Error ? caught.message : "Image generation failed.");
    } finally {
      setAiLoading(false);
    }
  }

  function copyForSize(sizeId: CoverSizeId) {
    return {
      ...coverCopy,
      title: sizeId === "wechat-1x1" ? config.shortTitle.trim() || coverCopy.title : coverCopy.title
    };
  }

  async function downloadOne(sizeId: CoverSizeId, stepIndex: number, totalSteps: number) {
    const node = nodeRefs.current[sizeId];
    if (!node) return;

    const size = coverSizes[sizeId];
    const baseProgress = stepIndex / totalSteps;
    const stepSpan = 1 / totalSteps;

    await exportCoverPng(node, size, coverFilename(platform, sizeId), (stage) => {
      setProgressLabel(stage);
      setProgress(Math.round((baseProgress + stepSpan * exportStageWeights[stage]) * 100));
    });
  }

  async function prepareSelectedAssetForExport() {
    if (!selectedAsset || (selectedAsset.provider !== "pexels" && selectedAsset.provider !== "pixabay")) return;
    setStockCachingId(selectedAsset.id);
    try {
      const prepared = await cacheStockAsset(selectedAsset);
      setSelectedAsset(prepared);
      // Let every hidden export canvas receive the first-party URL before
      // modern-screenshot serializes it.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    } finally {
      setStockCachingId(null);
    }
  }

  async function handleDownload() {
    if (!canExport) {
      onLockedExport?.();
      return;
    }
    setExporting(true);
    setProgress(0);
    setCoverError(null);

    try {
      await prepareSelectedAssetForExport();
      if (platform === "xiaohongshu" && !qrRiskAcknowledged) {
        const node = nodeRefs.current[previewSizeId];
        if (node) {
          const dataUrl = await exportCoverPngToDataUrl(node, coverSizes[previewSizeId]);
          const complianceResponse = await fetch(dataUrl);
          const compliance = await inspectImageCompliance(await complianceResponse.blob());
          if (compliance.qrCode === "detected") {
            setQrRiskDetected(true);
            setCoverError(coverStudioCopy[locale].xhsQrBlocked);
            captureEvent("xhs_cover_export_blocked", { action: "download" });
            return;
          }
        }
      }
      const sizesToRender = spec.sizes;
      for (let i = 0; i < sizesToRender.length; i += 1) {
        await downloadOne(sizesToRender[i], i, sizesToRender.length);
      }
      setProgress(100);
    } catch (caught) {
      setCoverError(caught instanceof Error ? caught.message : (locale === "en" ? "Cover export failed. Please try again." : "封面导出失败，请重试。"));
    } finally {
      window.setTimeout(() => {
        setExporting(false);
        setProgress(0);
        setProgressLabel(null);
      }, 400);
    }
  }

  /**
   * Renders the currently-selected preview size to a PNG and saves it back as
   * the kit output's persisted cover (plan §3 P1-2 增强). Only meaningful when
   * the kit has been saved (kitId + output.id exist); trial kits can't persist.
   */
  async function saveAsCover() {
    if (!kitId || !output.id) {
      setCoverError(locale === "en" ? "Save your kit first, then set its cover." : "先保存内容包，才能设置封面。");
      return;
    }
    if (!onSaveCover) {
      return;
    }

    const node = nodeRefs.current[previewSizeId];
    if (!node) return;

    setSavingCover(true);
    setCoverError(null);
    setCoverSaved(false);

    try {
      await prepareSelectedAssetForExport();
      const size = coverSizes[previewSizeId];
      const dataUrl = await exportCoverPngToDataUrl(node, size);
      // dataURL → Blob for multipart upload
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      if (platform === "xiaohongshu" && !qrRiskAcknowledged) {
        const compliance = await inspectImageCompliance(blob);
        if (compliance.qrCode === "detected") {
          setQrRiskDetected(true);
          setCoverError(coverStudioCopy[locale].xhsQrBlocked);
          captureEvent("xhs_cover_export_blocked", { action: "save" });
          return;
        }
      }

      const form = new FormData();
      form.append("file", blob, `cover-${platform}-${previewSizeId}.png`);

      const res = await fetch(`/api/kits/${kitId}/outputs/${output.id}/cover`, {
        method: "POST",
        body: form
      });
      const data = (await res.json()) as { imageUrl?: string; error?: string };
      if (!res.ok || !data.imageUrl) {
        throw new Error(data.error ?? "Failed to save the cover.");
      }
      onSaveCover(data.imageUrl);
      setCoverSaved(true);
    } catch (caught) {
      setCoverError(caught instanceof Error ? caught.message : "Failed to save the cover.");
    } finally {
      setSavingCover(false);
    }
  }

  const c = coverStudioCopy[locale];
  const stockProviderUrl = stockProvider === "pixabay" ? "https://pixabay.com" : "https://www.pexels.com";
  const stockLicenseUrl = stockProvider === "pixabay" ? "https://pixabay.com/service/license-summary/" : "https://www.pexels.com/license/";
  const stockCredit = stockProvider === "pixabay" ? c.pixabayCredit : c.pexelsCredit;
  const visibleTemplates = getTemplatesByCategory(templateCategory);
  const showTemplates = isMobile ? mobileStep === "template" : activePanel === "templates";
  const showPhotos = isMobile ? mobileStep === "visual" && activePanel === "photos" : activePanel === "photos";
  const showUpload = isMobile ? mobileStep === "visual" && activePanel === "upload" : activePanel === "upload";
  const showAi = isMobile ? mobileStep === "visual" && activePanel === "ai" : activePanel === "ai";
  const showTextControls = !isMobile || mobileStep === "text";
  const panels = [
    { id: "templates" as const, label: c.panelTemplates, icon: LayoutTemplate },
    { id: "photos" as const, label: c.panelPhotos, icon: ImageIcon },
    { id: "upload" as const, label: c.panelUpload, icon: Upload },
    { id: "ai" as const, label: c.panelAi, icon: WandSparkles }
  ];
  const mobileSteps = [
    { id: "template" as const, label: c.mobileStepTemplate, number: "1" },
    { id: "visual" as const, label: c.mobileStepVisual, number: "2" },
    { id: "text" as const, label: c.mobileStepText, number: "3" }
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cover-studio-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-fg/50 p-0 backdrop-blur-sm md:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !exporting) onClose();
      }}
    >
      <div className="rk-enter relative flex h-dvh w-full max-w-6xl flex-col overflow-hidden border border-hairline bg-surface shadow-panel md:h-auto md:max-h-[calc(100vh-2rem)] md:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3 md:px-5 md:py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-fg">
              <PlatformGlyph platform={platform} className="h-4 w-4" />
            </span>
            <div>
              <h2 id="cover-studio-title" className="text-sm font-semibold text-fg">{c.title}</h2>
              <p className="text-xs text-fg-muted">
                {platformInfo.label}
                <span className="ml-2 text-[10px] text-action-strong md:hidden dark:text-action">{mobileSteps.findIndex((step) => step.id === mobileStep) + 1}/3 · {mobileSteps.find((step) => step.id === mobileStep)?.label}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={locale === "en" ? "Close cover studio" : "关闭封面设计"}
            title={locale === "en" ? "Close" : "关闭"}
            className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface text-fg-muted shadow-sm transition-colors hover:border-action/45 hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
            disabled={exporting}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[360px_1fr] md:gap-5 md:p-5">
          {/* Controls */}
          <div className="order-2 flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-28 pt-4 md:order-1 md:px-0 md:pb-0 md:pt-0">
            <div className="rounded-xl border border-hairline bg-surface-2/60 p-1.5 md:hidden">
              <div className="grid grid-cols-3 gap-1">
                {mobileSteps.map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      setMobileStep(step.id);
                      if (step.id === "visual" && activePanel === "templates") setActivePanel("photos");
                    }}
                    aria-pressed={mobileStep === step.id}
                    className={`focus-ring flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-[11px] font-semibold transition-all ${
                      mobileStep === step.id ? "bg-fg text-surface shadow-panel" : "text-fg-muted hover:bg-surface hover:text-fg"
                    }`}
                  >
                    <span aria-hidden="true" className={`grid h-4 w-4 place-items-center rounded-full text-[9px] ${mobileStep === step.id ? "bg-action text-on-action" : "bg-surface text-fg-muted"}`}>{step.number}</span>
                    {step.label}
                  </button>
                ))}
              </div>
            </div>

            {mobileStep === "visual" ? (
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-hairline bg-surface-2/60 p-1.5 md:hidden">
                {panels.filter((panel) => panel.id !== "templates").map((panel) => {
                  const PanelIcon = panel.icon;
                  return (
                    <button
                      key={panel.id}
                      type="button"
                      onClick={() => setActivePanel(panel.id)}
                      aria-pressed={activePanel === panel.id}
                      className={`focus-ring flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-semibold ${activePanel === panel.id ? "bg-surface text-fg shadow-panel" : "text-fg-muted"}`}
                    >
                      <PanelIcon className="h-3.5 w-3.5" />
                      {panel.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="hidden rounded-xl border border-hairline bg-surface-2/60 p-1.5 md:block">
              <div className="grid grid-cols-4 gap-1">
                {panels.map((panel) => {
                  const PanelIcon = panel.icon;
                  return (
                    <button
                      key={panel.id}
                      type="button"
                      onClick={() => setActivePanel(panel.id)}
                      aria-pressed={activePanel === panel.id}
                      className={`focus-ring flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-semibold transition-all ${
                        activePanel === panel.id
                          ? "bg-fg text-surface shadow-panel"
                          : "text-fg-muted hover:bg-surface hover:text-fg"
                      }`}
                    >
                      <PanelIcon className="h-3.5 w-3.5" />
                      <span className="truncate">{panel.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {showTemplates ? (
              <div className="rounded-xl border border-hairline bg-surface p-3">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="eyebrow">{c.templateLibrary}</p>
                    <p className="mt-0.5 text-[10px] text-fg-muted">{coverTemplates.length} {c.templatesCount}</p>
                  </div>
                  <span className="rounded-full bg-positive/10 px-2 py-0.5 text-[9px] font-semibold text-positive">{c.noAiCost}</span>
                </div>
                <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1">
                  {coverTemplateCategories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setTemplateCategory(category)}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                        templateCategory === category ? "bg-brand text-white" : "bg-surface-2 text-fg-muted hover:text-fg"
                      }`}
                    >
                      {c.categoryLabels[category]}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {visibleTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      locale={locale}
                      selected={selectedTemplateId === template.id}
                      onSelect={() => applyTemplate(template)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {showPhotos ? (
              <div className="rounded-xl border border-hairline bg-surface p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="eyebrow">{c.photoLibrary}</p>
                    <p className="mt-0.5 text-[10px] text-fg-muted">{c.photoLibraryHint}</p>
                  </div>
                  <a href={stockProviderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[9px] font-semibold text-fg-muted hover:text-fg">
                    {stockProviderName(stockProvider)} <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
                <div className="mb-2 flex rounded-lg border border-hairline bg-surface-2/60 p-1" role="group" aria-label={c.stockSourceLabel}>
                  {(["pexels", "pixabay"] as const).map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => {
                        if (provider === stockProvider) return;
                        setStockProvider(provider);
                        setStockAssets([]);
                        setStockError(null);
                        setActivePreset("custom");
                        void loadStockPhotos(stockQuery, provider);
                      }}
                      aria-pressed={stockProvider === provider}
                      className={`focus-ring flex-1 rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                        stockProvider === provider ? "bg-surface text-fg shadow-panel" : "text-fg-muted hover:text-fg"
                      }`}
                    >
                      {stockProviderName(provider)}
                    </button>
                  ))}
                </div>
                <form
                  className="relative mb-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setActivePreset("custom");
                    void loadStockPhotos(stockQuery);
                  }}
                >
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
                  <input
                    value={stockQuery}
                    onChange={(event) => setStockQuery(event.target.value)}
                    placeholder={c.searchPlaceholder}
                    maxLength={80}
                    className="field-input h-9 w-full pl-8 pr-14 text-xs"
                  />
                  <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-fg px-2 py-1 text-[9px] font-semibold text-surface">
                    {c.search}
                  </button>
                </form>
                <div className="mb-2.5 flex gap-1 overflow-x-auto pb-1">
                  {stockSearchPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setActivePreset(preset.id);
                        setStockQuery(preset.query);
                        void loadStockPhotos(preset.query);
                      }}
                      className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-medium ${
                        activePreset === preset.id ? "bg-brand/15 text-brand" : "bg-surface-2 text-fg-muted hover:text-fg"
                      }`}
                    >
                      {stockPresetLabel(preset, locale)}
                    </button>
                  ))}
                </div>
                {stockLoading ? (
                  <div className="grid h-32 place-items-center text-fg-muted"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : stockError ? (
                  <div className="rounded-lg border border-dashed border-hairline bg-surface-2 p-4 text-center">
                    <p className="text-[11px] font-medium text-fg">{c.photosUnavailable}</p>
                    <p className="mt-1 text-[10px] leading-4 text-fg-muted">{stockError}</p>
                    <button type="button" onClick={() => { setStockError(null); void loadStockPhotos(stockQuery); }} className="mt-2 text-[10px] font-semibold text-action-strong dark:text-action">{c.retry}</button>
                  </div>
                ) : (
                  <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto pr-1">
                    {stockAssets.map((asset, index) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => void chooseAsset(asset)}
                        disabled={stockCachingId !== null}
                        title={coverAssetAttribution(asset, locale)}
                        className={`group relative aspect-[3/4] overflow-hidden rounded-md border-2 bg-surface-2 disabled:cursor-wait disabled:opacity-60 ${
                          selectedAsset?.id === asset.id ? "border-brand" : "border-transparent"
                        }`}
                      >
                        {/* Stock URLs are temporary search-result previews. A selected
                            Pexels or Pixabay image is copied into Finfold storage before use. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={asset.previewUrl} alt={asset.alt} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading={index < 6 ? "eager" : "lazy"} />
                        {stockCachingId === asset.id ? <span className="absolute inset-0 grid place-items-center bg-fg/45 text-white"><Loader2 className="h-4 w-4 animate-spin" /></span> : null}
                        {selectedAsset?.id === asset.id ? <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-action text-on-action"><Check className="h-3 w-3" /></span> : null}
                        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-5 text-left text-[8px] text-white">{asset.photographer}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[9px] leading-4 text-fg-muted">
                  {stockCredit} <a href={stockLicenseUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">{c.license}</a>
                </p>
              </div>
            ) : null}

            {showUpload ? (
              <div className="rounded-xl border border-hairline bg-surface p-3">
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  className="focus-ring group flex w-full flex-col items-center rounded-xl border border-dashed border-hairline bg-surface-2 px-4 py-8 text-center transition-colors hover:border-action/50 hover:bg-action/[0.05]"
                >
                  <span className="mb-2 grid h-9 w-9 place-items-center rounded-full bg-surface text-fg shadow-panel"><Upload className="h-4 w-4" /></span>
                  <span className="text-xs font-semibold text-fg">{c.chooseUpload}</span>
                  <span className="mt-1 text-[10px] text-fg-muted">JPG · PNG · WebP · 15MB</span>
                </button>
                <input ref={uploadInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void handleUpload(event.target.files?.[0])} />
                <p className="mt-2 text-[10px] leading-4 text-fg-muted">{c.uploadRightsHint}</p>
                {platform === "xiaohongshu" ? (
                  <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-fg-muted">
                    {complianceChecking ? <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-action" /> : <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-positive" />}
                    {complianceChecking ? c.xhsQrChecking : c.xhsQrUploadHint}
                  </p>
                ) : null}
              </div>
            ) : null}

            {showAi ? (
              <div className="rounded-xl border border-hairline bg-surface p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow">{c.aiVisual}</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-fg-muted">{c.aiOptionalHint}</p>
                  </div>
                  <span className="rounded-full bg-action/[0.1] px-2 py-0.5 text-[9px] font-semibold text-action-strong dark:text-action">{c.manualOnly}</span>
                </div>
                <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} rows={4} maxLength={1600} className="field-input min-h-24 resize-y text-xs" />
                <button type="button" onClick={() => void generateAiVisual()} disabled={aiLoading || !aiPrompt.trim()} className="btn-primary focus-ring mt-2 w-full px-3 py-2 text-xs disabled:opacity-50">
                  {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
                  {aiLoading ? c.aiGenerating : c.generateAi}
                </button>
                {output.imageUrl ? (
                  <p className="mt-2 text-[10px] leading-4 text-fg-muted">
                    {c.aiReplaceHint.replace("{credits}", String(ACTION_CREDITS.standardImage))}
                  </p>
                ) : null}
                {aiError ? <p className="mt-2 text-[10px] leading-4 text-danger">{aiError}</p> : null}
              </div>
            ) : null}

            {selectedAsset && (!isMobile || mobileStep !== "template") ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-hairline bg-surface-2 px-2.5 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold text-fg">{coverAssetAttribution(selectedAsset, locale)}</p>
                  <p className="truncate text-[9px] text-fg-muted">{selectedAsset.licenseName}</p>
                </div>
                {selectedAsset.sourceUrl ? <a href={selectedAsset.sourceUrl} target="_blank" rel="noreferrer" aria-label={c.openSource} className="shrink-0 text-fg-muted hover:text-fg"><ExternalLink className="h-3.5 w-3.5" /></a> : null}
              </div>
            ) : null}

            {platform === "xiaohongshu" && qrRiskDetected ? (
              <div role="alert" data-testid="xhs-cover-qr-warning" className="rounded-xl border border-risk/30 bg-risk/[0.07] p-3">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-risk" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-risk">{c.xhsQrTitle}</p>
                    <p className="mt-1 text-[10px] leading-4 text-fg-muted">{c.xhsQrBody}</p>
                  </div>
                </div>
                {qrRiskAcknowledged ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[9px] font-bold text-warn"><ShieldCheck className="h-3 w-3" />{c.xhsQrAcknowledged}</p>
                ) : (
                  <button type="button" onClick={() => { setQrRiskAcknowledged(true); setCoverError(null); }} className="focus-ring mt-2 rounded-lg border border-risk/30 bg-surface px-2.5 py-1.5 text-[9px] font-bold text-risk">
                    {c.xhsQrAcknowledge}
                  </button>
                )}
              </div>
            ) : null}

            {showTextControls ? (
              <>
                <div>
                  <p className="eyebrow mb-2">{c.themeLabel}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {themes.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        title={locale === "zh" ? theme.nameZh : theme.nameEn}
                        aria-label={locale === "zh" ? theme.nameZh : theme.nameEn}
                        aria-pressed={config.themeId === theme.id}
                        onClick={() => setConfig((prev) => ({ ...prev, themeId: theme.id }))}
                        className={`h-9 w-9 rounded-full border-2 transition-transform md:h-7 md:w-7 ${
                          config.themeId === theme.id ? "scale-110 border-fg" : "border-hairline"
                        }`}
                        style={{ background: theme.accent }}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-action/20 bg-action/[0.05] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="eyebrow">{c.copyLabel}</p>
                <span className="rounded-full bg-positive/10 px-2 py-0.5 text-[10px] font-semibold text-positive">{c.exactTextBadge}</span>
              </div>
              <div className="grid gap-2.5">
                <label className="grid gap-1 text-[11px] font-medium text-fg-muted">
                  {c.kickerLabel}
                  <input
                    type="text"
                    value={coverCopy.kicker}
                    maxLength={28}
                    onChange={(event) => setCoverCopy((current) => ({ ...current, kicker: event.target.value }))}
                    className="field-input text-xs"
                  />
                </label>
                <label className="grid gap-1 text-[11px] font-medium text-fg-muted">
                  {c.titleLabel}
                  <textarea
                    value={coverCopy.title}
                    rows={2}
                    maxLength={72}
                    onChange={(event) => setCoverCopy((current) => ({ ...current, title: event.target.value }))}
                    className="field-input min-h-16 resize-y text-xs"
                  />
                </label>
                <label className="grid gap-1 text-[11px] font-medium text-fg-muted">
                  {c.subtitleLabel}
                  <textarea
                    value={coverCopy.highlight}
                    rows={2}
                    maxLength={120}
                    onChange={(event) => setCoverCopy((current) => ({ ...current, highlight: event.target.value }))}
                    className="field-input min-h-16 resize-y text-xs"
                  />
                </label>
              </div>
              <p className="mt-2 text-[10px] leading-4 text-fg-muted">{c.exactTextHint}</p>
                </div>

                {pair ? (
                  <div>
                <p className="eyebrow mb-2">{c.shortTitleLabel}</p>
                <input
                  type="text"
                  value={config.shortTitle}
                  onChange={(event) => setConfig((prev) => ({ ...prev, shortTitle: event.target.value }))}
                  placeholder={deriveShortTitle(output.title, locale)}
                  className="field-input text-xs"
                />
                  </div>
                ) : null}

                {spec.sizes.length > 1 ? (
                  <div>
                <p className="eyebrow mb-2">{c.sizeLabel}</p>
                <div className="flex gap-1.5">
                  {spec.sizes.map((sizeId, index) => (
                    <button
                      key={sizeId}
                      type="button"
                      onClick={() => setActiveSizeIndex(index)}
                      aria-pressed={activeSizeIndex === index}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-all ${
                        activeSizeIndex === index ? "bg-brand text-white" : "bg-surface-2 text-fg-muted hover:text-fg"
                      }`}
                    >
                      {coverSizes[sizeId].label}
                    </button>
                  ))}
                </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="mt-1 hidden md:block">
              <button
                type="button"
                onClick={() => void handleDownload()}
                disabled={exporting}
                className="btn-primary focus-ring px-3 py-2 text-xs"
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {exporting ? c.exporting : !canExport ? c.downloadLocked : pair ? c.downloadAll : c.download}
              </button>
            </div>

            {kitId && onSaveCover && output.id ? (
              <button
                type="button"
                onClick={() => void saveAsCover()}
                disabled={savingCover || exporting}
                className="focus-ring mt-1 hidden rounded-lg border border-hairline bg-surface px-3 py-2 text-xs font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-50 md:flex"
              >
                {savingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {savingCover ? c.savingCover : coverSaved ? c.coverSaved : c.saveCover}
              </button>
            ) : null}

            {coverError ? (
              <p className="hidden text-[11px] text-danger md:block">{coverError}</p>
            ) : coverSaved ? (
              <p className="hidden text-[11px] text-positive md:block">{c.coverSavedHint}</p>
            ) : null}

            {exporting ? (
              <div className="hidden rounded-lg border border-hairline bg-surface-2 p-3 md:block">
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-fg-muted">
                  <span>{progressLabel ? c.stageLabels[progressLabel] : c.stageLabels.fonts}</span>
                  <span className="tabular">{progress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
                  <div
                    className="h-full rounded-full bg-action transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-fg-muted">
                  {c.estimated} ~{estimatedSeconds}s
                </p>
              </div>
            ) : null}
          </div>

          {/* Live preview + hidden full-res export nodes */}
          <div className="order-1 flex h-[31dvh] min-h-[230px] max-h-[300px] shrink-0 flex-col items-center justify-center gap-2 border-b border-hairline bg-surface-2 p-3 md:order-2 md:h-auto md:max-h-none md:min-h-0 md:rounded-xl md:border md:p-6">
            <PreviewScaled sizeId={previewSizeId} maxWidth={isMobile ? 340 : 360} maxHeight={isMobile ? 210 : undefined}>
              <CoverCanvas output={previewOutput} platformLabel={platformInfo.label} sizeId={previewSizeId} config={config} locale={locale} contentOverrides={copyForSize(previewSizeId)} />
            </PreviewScaled>
            <p className="eyebrow text-fg-muted">{coverSizes[previewSizeId].label}</p>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 border-t border-hairline bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
          {coverError ? <p className="mb-2 text-[10px] text-danger">{coverError}</p> : coverSaved ? <p className="mb-2 text-[10px] text-positive">{c.coverSavedHint}</p> : null}
          {mobileStep === "template" ? (
            <button type="button" onClick={() => { setMobileStep("visual"); if (activePanel === "templates") setActivePanel("photos"); }} className="focus-ring inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-3 py-2.5 text-xs font-semibold text-action-strong transition hover:bg-action/[0.14] dark:text-action">
              {c.mobileNextVisual}
            </button>
          ) : mobileStep === "visual" ? (
            <button type="button" onClick={() => setMobileStep("text")} className="focus-ring inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-action/45 bg-action/[0.08] px-3 py-2.5 text-xs font-semibold text-action-strong transition hover:bg-action/[0.14] dark:text-action">
              {c.mobileNextText}
            </button>
          ) : (
            <div className={`grid gap-2 ${kitId && onSaveCover && output.id ? "grid-cols-2" : "grid-cols-1"}`}>
              <button type="button" onClick={() => void handleDownload()} disabled={exporting} className="btn-primary focus-ring justify-center px-3 py-2.5 text-xs">
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {exporting ? `${progress}%` : !canExport ? c.downloadLocked : pair ? c.downloadAll : c.download}
              </button>
              {kitId && onSaveCover && output.id ? (
                <button type="button" onClick={() => void saveAsCover()} disabled={savingCover || exporting} className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline bg-surface-2 px-3 py-2.5 text-xs font-semibold text-fg disabled:opacity-50">
                  {savingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {savingCover ? c.savingCover : coverSaved ? c.coverSaved : c.saveCover}
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Off-screen full-resolution render nodes used for capture — one per size in the spec */}
        <div style={{ position: "fixed", left: -10000, top: 0 }} aria-hidden="true">
          {spec.sizes.map((sizeId) => (
            <div key={sizeId} ref={(el) => { nodeRefs.current[sizeId] = el; }}>
              <CoverCanvas output={previewOutput} platformLabel={platformInfo.label} sizeId={sizeId} config={config} locale={locale} contentOverrides={copyForSize(sizeId)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildRecommendedAiPrompt(output: KitOutput, brandBrain?: BrandBrain): string {
  const identityDirection = brandBrain ? buildVisualIdentityPrompt(brandBrain) : "";
  return [output.imagePrompt || output.title, identityDirection].filter(Boolean).join(". ");
}

function PreviewScaled({ sizeId, children, maxWidth = 360, maxHeight }: { sizeId: CoverSizeId; children: React.ReactNode; maxWidth?: number; maxHeight?: number }) {
  const size = coverSizes[sizeId];
  const scale = Math.min(1, maxWidth / size.cssWidth, maxHeight ? maxHeight / size.cssHeight : 1);

  return (
    <div style={{ width: size.cssWidth * scale, height: size.cssHeight * scale, overflow: "hidden" }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}

function TemplateCard({
  template,
  locale,
  selected,
  onSelect
}: {
  template: CoverTemplate;
  locale: Locale;
  selected: boolean;
  onSelect: () => void;
}) {
  const editorial = editorialThemes.find((theme) => theme.id === template.themeId) ?? editorialThemes[0];
  const swiss = swissAccents.find((theme) => theme.id === template.themeId) ?? swissAccents[0];
  const palette = template.style === "swiss"
    ? { paper: swiss.paper, ink: swiss.ink, accent: swiss.accent }
    : { paper: editorial.paper, ink: editorial.ink, accent: editorial.accent };

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`focus-ring group overflow-hidden rounded-lg border text-left transition-all ${
        selected ? "border-brand shadow-panel" : "border-hairline hover:-translate-y-0.5 hover:border-fg-muted"
      }`}
    >
      <span
        className="relative block h-20 overflow-hidden p-2"
        style={{
          background: template.style === "photo"
            ? `linear-gradient(145deg, ${palette.ink} 0%, ${palette.accent} 170%)`
            : palette.paper,
          color: template.style === "photo" ? "#fff" : palette.ink
        }}
      >
        {template.style === "swiss" ? (
          <>
            <span className="absolute left-2 top-2 h-2 w-8" style={{ background: palette.accent }} />
            <span className="absolute bottom-2 left-2 text-[17px] font-black leading-none">Aa</span>
            <span className="absolute bottom-2 right-2 h-8 w-8 rounded-full" style={{ background: palette.accent }} />
          </>
        ) : template.style === "photo" ? (
          <>
            <span className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 72% 26%, white 0 2%, transparent 3%), linear-gradient(120deg, transparent 40%, rgba(255,255,255,.32))" }} />
            <span className="absolute left-2 top-2 h-1.5 w-7 rounded-full" style={{ background: palette.accent }} />
            <span className="absolute bottom-2 left-2 text-sm font-black leading-none">Aa</span>
          </>
        ) : (
          <>
            <span className="block text-[7px] font-semibold uppercase tracking-[0.18em]" style={{ color: palette.accent }}>Finfold</span>
            <span className="mt-2 block font-serif text-[18px] font-bold leading-none">Aa</span>
            <span className="mt-1.5 block h-px w-full opacity-30" style={{ background: palette.ink }} />
            <span className="mt-1 block h-1 w-3/5 opacity-20" style={{ background: palette.ink }} />
          </>
        )}
        {selected ? <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-action text-on-action"><Check className="h-3 w-3" /></span> : null}
      </span>
      <span className="flex items-center justify-between gap-1 bg-surface px-2 py-1.5">
        <span className="truncate text-[10px] font-semibold text-fg">{locale === "en" ? template.nameEn : template.nameZh}</span>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: palette.accent }} />
      </span>
    </button>
  );
}

const coverStudioCopy = {
  zh: {
    title: "设计封面",
    panelTemplates: "模板",
    panelPhotos: "图库",
    panelUpload: "上传",
    panelAi: "AI 图片",
    mobileStepTemplate: "模板",
    mobileStepVisual: "视觉",
    mobileStepText: "文字",
    mobileNextVisual: "下一步 · 选择视觉",
    mobileNextText: "下一步 · 编辑文字",
    templateLibrary: "常用模板",
    templatesCount: "套模板",
    noAiCost: "无需生成图片",
    categoryLabels: {
      insight: "观点",
      tutorial: "教程",
      "case-study": "复盘",
      launch: "发布",
      report: "报告",
      story: "故事"
    },
    photoLibrary: "真实图库",
    photoLibraryHint: "免费可商用素材，选择后由 Finfold 排版并保存",
    stockSourceLabel: "图库来源",
    searchPlaceholder: "搜索真实照片（建议英文）",
    search: "搜索",
    photosUnavailable: "图库暂时不可用",
    retry: "重新加载",
    pexelsCredit: "照片由 Pexels 提供，建议在适当位置标注摄影师。",
    pixabayCredit: "Pixabay 搜索结果仅用于预览；选中后会保存到 Finfold，再用于封面。",
    license: "查看许可",
    chooseUpload: "选择自己的图片",
    uploadRightsHint: "使用产品截图和真实照片通常最能减少 AI 感。请确保你拥有图片使用权。",
    xhsQrChecking: "正在本地检查可识别二维码…",
    xhsQrUploadHint: "小红书素材会自动检查二维码，发布前仍建议人工复核。",
    xhsQrTitle: "检测到疑似二维码",
    xhsQrBody: "站外导流二维码可能导致限制展示或自然流量。建议更换、裁切或遮挡后再导出。",
    xhsQrAcknowledge: "确认这不是站外导流，允许导出",
    xhsQrAcknowledged: "已人工确认；Finfold 将保留风险提示",
    xhsQrBlocked: "检测到疑似二维码。请更换、裁切或遮挡；如果确认不用于站外导流，可在风险卡中手动放行。",
    aiVisual: "生成独特视觉",
    aiOptionalHint: "只在图库和上传素材无法表达主题时使用。不会在生成内容时自动调用。",
    manualOnly: "手动触发",
    generateAi: "生成 AI 视觉",
    aiReplaceHint: "重新生成会替换当前封面，另扣 {credits} credits。",
    aiGenerating: "正在生成视觉…",
    openSource: "打开素材来源",
    styleLabel: "视觉体系",
    stylePhoto: "图片主视觉",
    styleEditorial: "电子杂志",
    styleSwiss: "瑞士网格",
    recommended: "推荐",
    themeLabel: "主题色板",
    visualPlateHint: "图片模型只负责无文字主视觉；标题、标签和副标题由 Finfold 精确排版。",
    noVisualPlateHint: "当前没有可用主视觉。上传图片或生成视觉底图后，可使用图片主视觉版式。",
    copyLabel: "封面文案",
    exactTextBadge: "零错字排版",
    kickerLabel: "栏目标签",
    titleLabel: "主标题",
    subtitleLabel: "副标题",
    exactTextHint: "这些文字不会交给图片模型重写，导出内容与输入完全一致。",
    shortTitleLabel: "1:1 短标题",
    sizeLabel: "尺寸",
    download: "下载 PNG",
    downloadAll: "下载全部",
    downloadLocked: "升级后下载 PNG",
    exporting: "正在生成…",
    saveCover: "保存为封面",
    savingCover: "保存中…",
    coverSaved: "已设为封面",
    coverSavedHint: "封面已更新到该平台草稿。",
    estimated: "预计耗时",
    stageLabels: {
      fonts: "加载字体…",
      capture: "渲染画面…",
      encode: "生成图片…",
      done: "完成"
    }
  },
  en: {
    title: "Design cover",
    panelTemplates: "Templates",
    panelPhotos: "Photos",
    panelUpload: "Upload",
    panelAi: "AI image",
    mobileStepTemplate: "Template",
    mobileStepVisual: "Visual",
    mobileStepText: "Text",
    mobileNextVisual: "Next · Choose a visual",
    mobileNextText: "Next · Edit text",
    templateLibrary: "Template library",
    templatesCount: "templates",
    noAiCost: "No image call",
    categoryLabels: {
      insight: "Insight",
      tutorial: "Tutorial",
      "case-study": "Case study",
      launch: "Launch",
      report: "Report",
      story: "Story"
    },
    photoLibrary: "Real photo library",
    photoLibraryHint: "Commercial-use stock, then Finfold typesets and stores it",
    stockSourceLabel: "Stock source",
    searchPlaceholder: "Search real photography",
    search: "Search",
    photosUnavailable: "Photo library is unavailable",
    retry: "Try again",
    pexelsCredit: "Photos provided by Pexels. Credit photographers when possible.",
    pixabayCredit: "Pixabay results are previews only; a selected image is saved by Finfold before it becomes your cover.",
    license: "View license",
    chooseUpload: "Choose your own image",
    uploadRightsHint: "Product screenshots and real photography usually feel the least artificial. Make sure you have permission to use the image.",
    xhsQrChecking: "Checking locally for recognizable QR codes…",
    xhsQrUploadHint: "Xiaohongshu assets are checked for QR codes; a final manual review is still recommended.",
    xhsQrTitle: "Possible QR code detected",
    xhsQrBody: "Off-platform QR codes may lead to restricted display or organic distribution. Replace, crop, or cover it before export.",
    xhsQrAcknowledge: "Confirm this is not off-platform diversion",
    xhsQrAcknowledged: "Manually confirmed; Finfold will keep the risk visible",
    xhsQrBlocked: "A possible QR code was found. Replace, crop, or cover it, or manually confirm that it is not used for off-platform diversion.",
    aiVisual: "Generate a unique visual",
    aiOptionalHint: "Use only when stock or uploaded media cannot express the idea. Content generation never calls this automatically.",
    manualOnly: "Manual only",
    generateAi: "Generate AI visual",
    aiReplaceHint: "Generating a new one replaces the current cover and costs {credits} more credits.",
    aiGenerating: "Generating visual…",
    openSource: "Open asset source",
    styleLabel: "Visual system",
    stylePhoto: "Photo impact",
    styleEditorial: "Editorial",
    styleSwiss: "Swiss",
    recommended: "Recommended",
    themeLabel: "Theme",
    visualPlateHint: "The image model creates a text-free visual plate. Finfold typesets every visible word precisely.",
    noVisualPlateHint: "No visual plate yet. Add or generate an image to unlock the photo-led layout.",
    copyLabel: "Cover copy",
    exactTextBadge: "Exact text",
    kickerLabel: "Kicker",
    titleLabel: "Headline",
    subtitleLabel: "Subhead",
    exactTextHint: "These words are never rewritten by the image model, so the export matches your input exactly.",
    shortTitleLabel: "1:1 short title",
    sizeLabel: "Size",
    download: "Download PNG",
    downloadAll: "Download all",
    downloadLocked: "Upgrade to download",
    exporting: "Generating…",
    saveCover: "Save as cover",
    savingCover: "Saving…",
    coverSaved: "Cover set",
    coverSavedHint: "The cover for this platform has been updated.",
    estimated: "Estimated",
    stageLabels: {
      fonts: "Loading fonts…",
      capture: "Rendering…",
      encode: "Encoding image…",
      done: "Done"
    }
  }
} as const;
