"use client";

import { Check, ChevronDown, Code, Copy, Download, Eye, FileText, Loader2, Pencil, RefreshCw, Send, Sparkles, ThumbsDown, ThumbsUp, Wand2, X } from "@/components/ui/icons";
import React, { useState, useEffect, useRef } from "react";
import type { KitOutput, MediaAsset } from "@/lib/content-schema";
import { dashboardCopy, type Locale } from "@/lib/i18n";
import { copyOutputRich, copyOutputsToClipboard, downloadMarkdown, formatAllOutputs } from "@/lib/kit-export";
import { canonicalContentTitle, displayContentTitle, isUsableContentTitle } from "@/lib/content-title";
import { getPlatform, type PlatformId } from "@/lib/platforms";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import type { UsedContext } from "@/components/workbench/WorkbenchProvider";
import { SocialMockup } from "@/components/workbench/mockups/SocialMockup";
import { BrandLottie } from "@/components/visual/brand-lottie";
import { CoverStudio } from "@/components/workbench/cover/CoverStudio";
import { VisualStoryStudio } from "@/components/workbench/visual-story/VisualStoryStudio";
import { VisualAssetPlanCard } from "@/components/workbench/visual-intelligence/VisualAssetPlanCard";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { captureEvent } from "@/lib/posthog";
import { loadPendingGeneration } from "@/lib/generation-run-client";
import type { FeedbackReason } from "@/lib/output-feedback";
import { buildVisualIntelligencePlan } from "@/lib/visual-intelligence";
import { brandBrainSchema, getBrandBrain, loadPersistedBrandBrain, type BrandBrain } from "@/lib/brand-brain";
import { buildArticleIllustrationPlan } from "@/lib/article-illustrations";
import { ArticleIllustrationStudio } from "@/components/workbench/visual-intelligence/ArticleIllustrationStudio";
import { addToast } from "@/components/ui/Toast";
import type { CadenceWarning } from "@/lib/publish-cadence";
import { AlertTriangle } from "@/components/ui/icons";
import { assessContentReadiness } from "@/lib/content-readiness";
import { estimatedGenerationSeconds } from "@/lib/generation-eta";
import { ContentReadinessCard } from "@/components/workbench/ContentReadinessCard";
import { ToneDriftAlert } from "@/components/workbench/ToneDriftAlert";
import { PublicationStudio } from "@/components/workbench/PublicationStudio";
import type { GrowthMission } from "@/lib/agent/growth-missions";
import { MemoryReceipt } from "@/components/memory/MemoryReceipt";
import type { MemoryReceiptItem } from "@/lib/memory-receipt";
import type { ToneDriftAssessment } from "@/lib/tone-drift";
import { hasQrCodeRisk } from "@/lib/image-compliance-client";
import { XhsImageComplianceAlert } from "@/components/workbench/XhsImageComplianceAlert";

type SavedFeedback = {
  outputId: string;
  rating: "helpful" | "unhelpful";
  reasonCodes: FeedbackReason[];
  note?: string;
  updatedAt: string;
};

const FEEDBACK_REASONS: FeedbackReason[] = ["generic", "off_brand", "weak_hook", "platform_fit", "inaccurate", "weak_cta"];
const PUBLISHED_STATES = new Set<KitOutput["publishStatus"]>(["posted", "measured", "iterated"]);
const FIRST_PUBLISH_KEY = "finfold-first-publish-celebrated";

function publishStatusLabel(status: KitOutput["publishStatus"], locale: Locale): string {
  if (locale === "en") {
    return status === "posted" ? "Published" : status === "measured" ? "Performance added" : status === "iterated" ? "Iterated" : status === "planned" ? "Scheduled" : "Draft";
  }
  return status === "posted" ? "已发布" : status === "measured" ? "已记录表现" : status === "iterated" ? "已迭代" : status === "planned" ? "已排期" : "草稿";
}

/** 划词 AI 微编辑（P0-2）的方向选项。 */
const REFINE_ACTIONS = [
  { id: "casual" as const, zh: "更口语", en: "Casual" },
  { id: "shorter" as const, zh: "更短", en: "Shorter" },
  { id: "hook" as const, zh: "换钩子", en: "Hook" },
  { id: "brand-voice" as const, zh: "品牌语气", en: "Brand voice" }
];

type OutputBoardProps = {
  outputs: KitOutput[];
  isLoading: boolean;
  /** Durable generation run is still executing in the background (queued /
   * recovering). When true the board keeps showing the loading animation
   * (ETA + steps) instead of jumping to the empty-state illustration, because
   * isLoading is already false at that point but outputs haven't arrived. */
  isRunActive?: boolean;
  error: string | null;
  locale: Locale;
  canUseOutputs?: boolean;
  onLockedAction?: (reason: "copy" | "export" | "save" | "analyze" | "iterate") => void;
  /** The saved kit's id — editing requires both this and output.id, since
   * PUT /api/kits/[kitId]/outputs/[outputId] addresses a persisted row.
   * Trial/unsaved kits have neither, so editing is simply unavailable there. */
  kitId?: string;
  onOutputSaved?: (platform: string, patch: Partial<KitOutput>) => void;
  /** Pro+ feature — see lib/payment/types.ts PLAN_FEATURES.polish. */
  canPolish?: boolean;
  /** Number of platforms being generated — used to estimate wait time.
   * Generation is batched 2 platforms at a time (see lib/llm.ts BATCH_SIZE),
   * so more platforms means a proportionally longer wait. */
  platformCount?: number;
  /** Platforms the user asked to generate. During streaming, platforms in this
   * list that haven't arrived yet render as "generating" placeholder cards so
   * the board shows progress instead of one opaque spinner. */
  expectedPlatforms?: PlatformId[];
  /** 本次生成实际引用的品牌上下文计数（P0-5 胶囊）——来自 /api/generate 的 done 事件。 */
  usedContext?: UsedContext | null;
  /** First-party or user-supplied image used as a quiet visual anchor. */
  referenceImageUrl?: string;
  growthMissionId?: string;
  /** Source-image compliance results captured during upload. */
  mediaAssets?: MediaAsset[];
  onReviewMedia?: () => void;
};

export function OutputBoard({ outputs, isLoading, error, locale, canUseOutputs = true, onLockedAction, kitId, onOutputSaved, canPolish = false, platformCount, expectedPlatforms, usedContext, referenceImageUrl, growthMissionId, mediaAssets = [], onReviewMedia, isRunActive = false }: OutputBoardProps) {
  // isLoading=true 是同步流式生成阶段；isRunActive=true 是 durable 任务仍在后台
  // 执行（已入队 / 恢复中）。两者都属于"生成中"，必须统一显示 loading 动画
  // （含 ETA 与生成步骤）。否则 durable 入队后 isLoading 会提前置 false 而 outputs
  // 仍为空，此时会闪到空状态插画，并丢掉时间预测与生成过程显示。
  const isActive = isLoading || isRunActive;
  const copy = dashboardCopy[locale];
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [brandBrain, setBrandBrain] = useState<BrandBrain>(() => brandBrainSchema.parse({}));
  const [growthMission, setGrowthMission] = useState<GrowthMission | null>(null);
  const [memoryReceipt, setMemoryReceipt] = useState<MemoryReceiptItem[]>([]);

  useEffect(() => {
    setBrandBrain(getBrandBrain());
    setMemoryReceipt([]);
    if (!kitId) return;
    let active = true;
    loadPersistedBrandBrain()
      .then(({ brain }) => { if (active) setBrandBrain(brain); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [kitId]);

  useEffect(() => {
    if (!growthMissionId) {
      setGrowthMission(null);
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/agent/missions/${encodeURIComponent(growthMissionId)}`, {
      cache: "no-store",
      signal: controller.signal
    }).then(async (response) => {
      const data = await response.json() as { mission?: GrowthMission };
      if (response.ok && data.mission) setGrowthMission(data.mission);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [growthMissionId]);

  // Track preview mode per platform. "preview" for High-Fi Social view, "raw" for content block views.
  const [viewModes, setViewModes] = useState<Record<string, "preview" | "raw">>({});

  const [coverFor, setCoverFor] = useState<PlatformId | null>(null);
  const [visualStoryFor, setVisualStoryFor] = useState<PlatformId | null>(null);
  const [illustrationFor, setIllustrationFor] = useState<PlatformId | null>(null);
  const [publicationFor, setPublicationFor] = useState<PlatformId | null>(null);

  const [editingPlatform, setEditingPlatform] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftCta, setDraftCta] = useState("");
  const [savingPlatform, setSavingPlatform] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [polishingPlatform, setPolishingPlatform] = useState<string | null>(null);
  const [postingPlatform, setPostingPlatform] = useState<string | null>(null);
  const [qrConfirmationFor, setQrConfirmationFor] = useState<string | null>(null);
  // 单平台重新生成（P0-3）：展开方向输入 + loading 状态。
  const [regenOpenFor, setRegenOpenFor] = useState<string | null>(null);
  const [regenDirection, setRegenDirection] = useState("");
  const [regeneratingPlatform, setRegeneratingPlatform] = useState<string | null>(null);
  const [improvingPlatform, setImprovingPlatform] = useState<string | null>(null);
  // 划词 AI 微编辑（P0-2）。
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [refiningAction, setRefiningAction] = useState<string | null>(null);
  const [refineWarn, setRefineWarn] = useState<string[] | null>(null);
  const [feedbackByOutput, setFeedbackByOutput] = useState<Record<string, SavedFeedback>>({});
  const [feedbackReasons, setFeedbackReasons] = useState<Record<string, FeedbackReason[]>>({});
  const [feedbackOpenFor, setFeedbackOpenFor] = useState<string | null>(null);
  const [feedbackSavingFor, setFeedbackSavingFor] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<{ outputId: string; message: string } | null>(null);
  // 发布节奏守护（2c）：每个未发布平台的风控预警，展示"再发有限流风险"提示，
  // 而不是拦截标记发布——这是给用户的建议，不是硬性阻断。
  const [cadenceWarnings, setCadenceWarnings] = useState<Record<string, CadenceWarning>>({});
  const [toneAssessments, setToneAssessments] = useState<Record<string, ToneDriftAssessment>>({});
  const [toneChecksLoading, setToneChecksLoading] = useState(false);
  // 首次标记发布的一次性彩带时刻——只在用户账号历史上第一次发生，用
  // localStorage 记一次，之后的发布不再重复播放。
  const [showFirstPublishCelebration, setShowFirstPublishCelebration] = useState(false);

  // Cycle through checking steps when loading
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  // Live elapsed-time counter so users waiting past the estimate can see
  // it's still working rather than assuming it's stuck.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // 移动端当前聚焦的平台（横向 pill 切换）；桌面端仍展示全部平台。
  const [mobileActivePlatform, setMobileActivePlatform] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive) {
      setLoadingStepIndex(0);
      setElapsedSeconds(0);
      return;
    }

    // Base elapsed time on the persisted generation start (savedAt in
    // localStorage, written at the top of generateKit for BOTH queue and
    // sync modes). Without this, a page refresh resets elapsedSeconds to 0
    // even though the backend run has been running for minutes — which reads
    // as "timer restarted from 0" and hides how long the user has waited.
    const persistedMs = (() => {
      try {
        const pending = loadPendingGeneration();
        return pending?.savedAt ? Date.parse(pending.savedAt) : NaN;
      } catch {
        return NaN;
      }
    })();
    const startedAtMs = Number.isFinite(persistedMs) ? persistedMs : Date.now();
    const syncElapsed = () =>
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    syncElapsed();

    const stepInterval = setInterval(() => {
      setLoadingStepIndex((prev) => {
        if (prev < 3) return prev + 1;
        return prev;
      });
    }, 1500);

    const elapsedInterval = setInterval(syncElapsed, 1000);

    return () => {
      clearInterval(stepInterval);
      clearInterval(elapsedInterval);
    };
  }, [isActive]);

  useEffect(() => {
    if (!kitId) {
      setFeedbackByOutput({});
      return;
    }

    let cancelled = false;
    async function loadFeedback() {
      try {
        const response = await fetch(`/api/output-feedback?kitId=${encodeURIComponent(kitId!)}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { feedback?: SavedFeedback[] };
        if (cancelled) return;
        setFeedbackByOutput(Object.fromEntries((data.feedback ?? []).map((item) => [item.outputId, item])));
      } catch {
        // Feedback is additive. A temporary analytics failure must not block
        // viewing or using generated content.
      }
    }
    void loadFeedback();
    return () => { cancelled = true; };
  }, [kitId]);

  // 每个尚未标记发布的平台，查一次节奏预警——数据来自该用户在该平台的历史
  // published_at（见 /api/publish-cadence），不阻断操作，仅提示。
  const unpublishedPlatforms = outputs.filter((output) => !PUBLISHED_STATES.has(output.publishStatus)).map((output) => output.platform).join(",");
  useEffect(() => {
    if (!kitId || !unpublishedPlatforms) {
      setCadenceWarnings({});
      return;
    }

    let cancelled = false;
    async function loadCadenceWarnings() {
      const platforms = unpublishedPlatforms.split(",");
      const results = await Promise.all(
        platforms.map(async (platform) => {
          try {
            const response = await fetch(`/api/publish-cadence?platform=${encodeURIComponent(platform)}`, { cache: "no-store" });
            if (!response.ok) return [platform, null] as const;
            const data = (await response.json()) as { warning?: CadenceWarning | null };
            return [platform, data.warning ?? null] as const;
          } catch {
            return [platform, null] as const;
          }
        })
      );
      if (cancelled) return;
      setCadenceWarnings(Object.fromEntries(results.filter(([, warning]) => warning !== null)) as Record<string, CadenceWarning>);
    }
    void loadCadenceWarnings();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitId, unpublishedPlatforms]);

  // Voice alignment is advisory and runs only after an output exists or a
  // saved edit changes it. It deliberately avoids keystroke-level requests.
  const toneReviewInputs = outputs
    .filter((output) => Boolean(output.id) && !PUBLISHED_STATES.has(output.publishStatus))
    .map((output) => ({
      id: output.id!,
      platform: output.platform,
      title: output.title,
      body: output.finalBody ?? output.body,
      cta: output.cta
    }));
  const toneReviewSignature = JSON.stringify(toneReviewInputs);
  useEffect(() => {
    if (!kitId || toneReviewInputs.length === 0) {
      setToneAssessments({});
      setToneChecksLoading(false);
      return;
    }

    const controller = new AbortController();
    setToneChecksLoading(true);
    void fetch("/api/tone-drift/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ kitId, outputs: toneReviewInputs })
    }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { assessments?: Record<string, ToneDriftAssessment> };
      if (!controller.signal.aborted) {
        setToneAssessments(data.assessments ?? {});
        const assessments = Object.values(data.assessments ?? {});
        captureEvent("tone_drift_checked", {
          outputs: assessments.length,
          warnings: assessments.filter((assessment) => assessment.status === "drift" && assessment.confidence !== "low").length
        });
      }
    }).catch(() => undefined).finally(() => {
      if (!controller.signal.aborted) setToneChecksLoading(false);
    });
    return () => controller.abort();
    // `toneReviewSignature` changes only when the persisted draft content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitId, toneReviewSignature]);

  // 预估用时基于该用户的历史真实生成耗时（localStorage），不再用写死的固定公式；
  // 首次使用（无样本）时回落到按 queue 批次校准的保守默认值。详见 lib/generation-eta.ts。
  const estimatedSeconds = estimatedGenerationSeconds(platformCount);

  // 流式生成期间：用户已选但尚未到达的平台 → 渲染"生成中"占位卡片，
  // 让画板呈现"逐个就绪"的进度感，而不是一个不透明的 spinner。
  const expectedList = expectedPlatforms ?? [];
  const pendingPlatforms = isLoading
    ? expectedList.filter((platformId) => !outputs.some((output) => output.platform === platformId))
    : [];
  const totalExpected = expectedList.length || outputs.length + pendingPlatforms.length;

  // 首个平台草稿可见时埋一次点 —— 对应"首个草稿可读时间"度量。
  const firstVisibleRef = useRef(false);
  useEffect(() => {
    if (isLoading && outputs.length >= 1 && !firstVisibleRef.current) {
      firstVisibleRef.current = true;
      captureEvent("output_first_visible", { total: totalExpected });
    }
    if (!isLoading) {
      firstVisibleRef.current = false;
    }
  }, [isLoading, outputs.length, totalExpected]);

  async function copyOutput(output: KitOutput) {
    if (!canUseOutputs) {
      onLockedAction?.("copy");
      return;
    }

    await copyOutputRich(output, locale);
    captureEvent("output_copied", { platform: output.platform, format: "rich" });
    setCopiedPlatform(output.platform);
    window.setTimeout(() => setCopiedPlatform(null), 1600);
  }

  async function copyAll() {
    if (!canUseOutputs) {
      onLockedAction?.("copy");
      return;
    }

    await copyOutputsToClipboard(outputs, locale);
    setCopiedAll(true);
    window.setTimeout(() => setCopiedAll(false), 1600);
  }

  function downloadMd() {
    if (!canUseOutputs) {
      onLockedAction?.("export");
      return;
    }

    downloadMarkdown(`finfold-content-kit-${new Date().toISOString().slice(0, 10)}.md`, formatAllOutputs(outputs, locale));
  }

  function openCoverStudio(platform: KitOutput["platform"]) {
    setCoverFor(platform);
  }

  function startEditing(output: KitOutput) {
    if (!canUseOutputs) {
      onLockedAction?.("save");
      return;
    }
    setSaveError(null);
    setDraftTitle(isUsableContentTitle(output.title) ? output.title : "");
    setDraftBody(output.finalBody ?? output.body);
    setDraftCta(output.cta);
    setEditingPlatform(output.platform);
  }

  function cancelEditing() {
    setEditingPlatform(null);
    setSaveError(null);
  }

  async function saveEdit(output: KitOutput) {
    if (!kitId || !output.id) {
      setSaveError(
        locale === "en" ? "This kit hasn't been saved yet — nothing to edit." : "该内容包还未保存，暂时无法编辑。"
      );
      return;
    }

    setSavingPlatform(output.platform);
    setSaveError(null);

    try {
      const response = await fetch(`/api/kits/${kitId}/outputs/${output.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: canonicalContentTitle(draftTitle),
          body: draftBody,
          cta: draftCta.trim()
        })
      });
      const data = (await response.json()) as { output?: KitOutput; memoryReceipt?: MemoryReceiptItem[]; error?: string };

      if (!response.ok || !data.output) {
        throw new Error(data.error ?? "Failed to save your edit.");
      }

      captureEvent("output_edited", { platform: output.platform });
      onOutputSaved?.(output.platform, {
        title: data.output.title,
        cta: data.output.cta,
        finalBody: data.output.finalBody,
        userEdited: data.output.userEdited
      });
      setMemoryReceipt(data.memoryReceipt ?? []);
      setEditingPlatform(null);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Failed to save your edit.");
    } finally {
      setSavingPlatform(null);
    }
  }

  async function polishOutput(output: KitOutput) {
    if (!canPolish) {
      onLockedAction?.("save");
      return;
    }
    if (!kitId || !output.id) {
      setSaveError(
        locale === "en" ? "This kit hasn't been saved yet — nothing to polish." : "该内容包还未保存，暂时无法润色。"
      );
      return;
    }

    setPolishingPlatform(output.platform);
    setSaveError(null);

    try {
      const response = await fetch(`/api/kits/${kitId}/outputs/${output.id}/polish`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() }
      });
      const data = (await response.json()) as { finalBody?: string; error?: string };

      if (!response.ok || !data.finalBody) {
        throw new Error(data.error ?? "Failed to polish this output.");
      }

      captureEvent("output_polished", { platform: output.platform });
      onOutputSaved?.(output.platform, { finalBody: data.finalBody, userEdited: true });
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Failed to polish this output.");
    } finally {
      setPolishingPlatform(null);
    }
  }

  async function regenerateOutput(
    output: KitOutput,
    options: { direction?: string; mode?: "regenerate" | "improve" } = {}
  ) {
    if (!kitId || !output.id) {
      setSaveError(
        locale === "en" ? "This kit hasn't been saved yet — nothing to regenerate." : "该内容包还未保存，无法重新生成。"
      );
      return;
    }

    const mode = options.mode ?? "regenerate";
    const direction = options.direction?.trim() || regenDirection.trim() || undefined;
    if (mode === "improve") setImprovingPlatform(output.platform);
    else setRegeneratingPlatform(output.platform);
    setSaveError(null);

    try {
      const response = await fetch(`/api/kits/${kitId}/outputs/${output.id}/regenerate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({ direction, mode })
      });
      const data = (await response.json()) as { output?: KitOutput; error?: string };

      if (!response.ok || !data.output) {
        throw new Error(data.error ?? "Failed to regenerate this output.");
      }

      captureEvent("output_regenerated", {
        platform: output.platform,
        withDirection: Boolean(direction),
        mode
      });
      onOutputSaved?.(output.platform, {
        title: data.output.title,
        body: data.output.body,
        cta: data.output.cta,
        notes: data.output.notes,
        strategy: data.output.strategy,
        finalBody: undefined,
        userEdited: false
      });
      if (mode === "improve") {
        addToast(
          "success",
          locale === "en"
            ? "Improved from the weakest quality signal. The score has been recalculated."
            : "已按最低分项完成优化，质量分已重新计算。"
        );
      } else {
        setRegenOpenFor(null);
        setRegenDirection("");
      }
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Failed to regenerate this output.");
    } finally {
      if (mode === "improve") setImprovingPlatform(null);
      else setRegeneratingPlatform(null);
    }
  }

  async function refineSelection(output: KitOutput, action: "casual" | "shorter" | "hook" | "brand-voice") {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = draftBody.slice(start, end);
    if (!selected.trim()) {
      setSaveError(locale === "en" ? "Select some text to refine first." : "请先选中要改写的文字。");
      setRefineWarn(null);
      return;
    }

    setRefiningAction(action);
    setSaveError(null);
    setRefineWarn(null);

    try {
      const response = await fetch("/api/refine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify({
          text: selected,
          platform: output.platform,
          action,
          context: draftBody
        })
      });
      const data = (await response.json()) as { text?: string; bannedHits?: string[]; error?: string };

      if (!response.ok || !data.text) {
        throw new Error(data.error ?? "Failed to refine the selection.");
      }

      captureEvent("output_refined", { platform: output.platform, action });
      // 仅替换选区，保留其余正文。
      const next = draftBody.slice(0, start) + data.text + draftBody.slice(end);
      setDraftBody(next);
      setRefineWarn(data.bannedHits?.length ? data.bannedHits : null);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Failed to refine the selection.");
    } finally {
      setRefiningAction(null);
    }
  }

  async function markOutputPosted(output: KitOutput, options?: { qrRiskConfirmed?: boolean }) {
    if (!kitId || !output.id) return;
    const hasXhsQrRisk = output.platform === "xiaohongshu" && mediaAssets.some(hasQrCodeRisk);
    if (hasXhsQrRisk && !options?.qrRiskConfirmed) {
      setQrConfirmationFor(output.platform);
      captureEvent("xhs_qr_publish_guard_shown", { flaggedImages: mediaAssets.filter(hasQrCodeRisk).length });
      addToast(
        "warning",
        locale === "en"
          ? "Check the final Xiaohongshu images before marking this draft as published."
          : "请先确认最终发布图中没有站外导流二维码。"
      );
      return;
    }
    setQrConfirmationFor(null);
    const previousStatus = output.publishStatus ?? "draft";
    const previousPublishedAt = output.publishedAt;
    const optimisticPublishedAt = new Date().toISOString();
    setPostingPlatform(output.platform);
    setSaveError(null);
    onOutputSaved?.(output.platform, { publishStatus: "posted", publishedAt: optimisticPublishedAt });
    try {
      const response = await fetch(`/api/kits/${kitId}/outputs/${output.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishStatus: "posted" })
      });
      const data = (await response.json()) as { output?: KitOutput; memoryReceipt?: MemoryReceiptItem[]; error?: string };
      if (!response.ok || !data.output) {
        const message = response.status === 401
          ? (locale === "en" ? "Please log in again before marking this output as published." : "登录状态已失效，请重新登录后再标记发布。")
          : (data.error ?? (locale === "en" ? "Failed to mark this output as published." : "未能标记为已发布，请重试。"));
        throw new Error(message);
      }

      onOutputSaved?.(output.platform, {
        publishStatus: data.output.publishStatus,
        publishedAt: data.output.publishedAt
      });
      captureEvent("output_published", { platform: output.platform });
      setMemoryReceipt(data.memoryReceipt ?? []);
      addToast("success", locale === "en" ? "Marked as published. You can add performance data next." : "已标记为发布，接下来可以记录表现数据。");

      try {
        if (!window.localStorage.getItem(FIRST_PUBLISH_KEY)) {
          window.localStorage.setItem(FIRST_PUBLISH_KEY, "1");
          setShowFirstPublishCelebration(true);
          window.setTimeout(() => setShowFirstPublishCelebration(false), 2400);
        }
      } catch {
        // localStorage 不可用时静默跳过——这只是一次性的庆祝动效，不影响发布本身。
      }
    } catch (caught) {
      onOutputSaved?.(output.platform, { publishStatus: previousStatus, publishedAt: previousPublishedAt });
      const message = caught instanceof Error
        ? caught.message
        : (locale === "en" ? "Failed to mark this output as published." : "未能标记为已发布，请重试。");
      setSaveError(message);
      addToast("error", message);
    } finally {
      setPostingPlatform(null);
    }
  }

  async function saveFeedback(output: KitOutput, rating: "helpful" | "unhelpful") {
    if (!kitId || !output.id) return;
    const reasonCodes = rating === "unhelpful" ? feedbackReasons[output.id] ?? [] : [];
    if (rating === "unhelpful" && reasonCodes.length === 0) {
      setFeedbackOpenFor(output.id);
      return;
    }

    setFeedbackSavingFor(output.id);
    setFeedbackError(null);
    try {
      const response = await fetch("/api/output-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputId: output.id, kitId, rating, reasonCodes })
      });
      const data = (await response.json()) as { feedback?: SavedFeedback; memoryReceipt?: MemoryReceiptItem[]; error?: string };
      if (!response.ok || !data.feedback) throw new Error(data.error ?? "Failed to save feedback.");

      setFeedbackByOutput((current) => ({ ...current, [output.id!]: data.feedback! }));
      setMemoryReceipt(data.memoryReceipt ?? []);
      setFeedbackOpenFor(null);
      captureEvent("output_feedback_saved", { platform: output.platform, rating, reasonCodes });
    } catch (caught) {
      setFeedbackError({ outputId: output.id, message: caught instanceof Error ? caught.message : "Failed to save feedback." });
    } finally {
      setFeedbackSavingFor(null);
    }
  }

  function toggleFeedbackReason(outputId: string, reason: FeedbackReason) {
    setFeedbackReasons((current) => {
      const selected = current[outputId] ?? [];
      const next = selected.includes(reason) ? selected.filter((item) => item !== reason) : [...selected, reason].slice(0, 3);
      return { ...current, [outputId]: next };
    });
  }

  async function forgetMemoryReceipt() {
    if (memoryReceipt.length === 0) return;
    if (memoryReceipt.some((item) => !item.outputId)) {
      throw new Error(locale === "en" ? "This memory source is no longer available." : "这次记忆的来源已不可用，暂时无法撤销。");
    }

    const response = await fetch("/api/brand-memory/forget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: memoryReceipt })
    });
    const data = (await response.json()) as { forgotten?: boolean; error?: string };
    if (!response.ok || !data.forgotten) {
      throw new Error(data.error ?? (locale === "en" ? "Could not forget this memory." : "暂时无法撤销这次记忆。"));
    }

    captureEvent("brand_memory_receipt_undone", { count: memoryReceipt.length });
    setMemoryReceipt([]);
    addToast(
      "success",
      locale === "en" ? "Memory removed. Finfold will not reuse it." : "已撤销，Finfold 后续不会沿用这次记忆。"
    );
  }

  const toggleViewMode = (platformId: string) => {
    setViewModes((prev) => ({
      ...prev,
      [platformId]: prev[platformId] === "raw" ? "preview" : "raw",
    }));
  };

  // 移动端聚焦的平台：优先用户选择，否则默认第一个。桌面端展示全部，此值不生效。
  const activeMobile =
    mobileActivePlatform && outputs.some((o) => o.platform === mobileActivePlatform)
      ? mobileActivePlatform
      : (outputs[0]?.platform ?? null);

  return (
    <section className="panel workbench-scroll relative min-h-0 min-w-0 p-3 sm:p-5 lg:min-h-[680px] xl:h-[min(860px,calc(100vh-128px))] xl:overflow-y-auto xl:pr-4">
      {showFirstPublishCelebration ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center" aria-hidden>
          <BrandLottie src="/lottie/success-confetti.json" loop={false} className="w-64 sm:w-80" />
        </div>
      ) : null}
      <div className={`${outputs.length === 0 ? "hidden lg:flex" : "flex"} mb-4 flex-col gap-3 border-b border-hairline pb-3 sm:flex-row sm:items-center sm:justify-between lg:mb-5 lg:pb-4`}>
        <div className="hidden items-center gap-2.5 lg:flex">
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
                {copiedAll ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5 text-fg-muted" />}
                {!canUseOutputs ? copy.unlockToCopy : copiedAll ? copy.copiedKit : copy.copyAll}
              </button>
              <button
                type="button"
                onClick={downloadMd}
                className="btn-primary focus-ring px-3 py-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                {!canUseOutputs ? copy.unlockToExport : copy.markdown}
              </button>
            </>
          ) : null}
          {isActive ? <Loader2 className="h-4 w-4 animate-spin text-fg-muted" /> : null}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-risk/30 bg-risk/10 p-3 text-sm text-risk">{error}</div>
      ) : null}

      {usedContext && !isActive ? <ContextCapsule ctx={usedContext} locale={locale} /> : null}

      {!isActive && memoryReceipt.length > 0 ? (
        <MemoryReceipt
          items={memoryReceipt}
          locale={locale}
          onDismiss={() => setMemoryReceipt([])}
          onUndo={forgetMemoryReceipt}
        />
      ) : null}

      {isActive && outputs.length === 0 ? (
        <div className="relative flex min-h-[460px] flex-col items-center justify-center overflow-hidden rounded-xl border border-hairline bg-surface-2 p-5 text-center sm:p-8 lg:min-h-[540px]">
          {/* Scanning animation gradient */}
          <div className="absolute inset-x-0 top-0 h-40 rk-scan bg-gradient-to-b from-brand/15 via-brand/5 to-transparent" />

          <div className="rk-fish-loader relative mb-6 h-24 w-24" aria-hidden="true">
            <span className="rk-fish-ripple absolute inset-1 rounded-full border border-brand/30" />
            <span className="rk-fish-ripple rk-fish-ripple-late absolute inset-1 rounded-full border border-accent/20" />
            <span className="rk-fish-current absolute inset-x-2 top-1/2 h-10 -translate-y-1/2 rounded-full bg-brand/10 blur-2xl" />
            <span className="rk-fish-shadow absolute bottom-2 left-1/2 h-2.5 w-12 -translate-x-1/2 rounded-full bg-brand/35 blur-md" />
            <span className="rk-fish-jump relative z-10 mx-auto flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-[20px] bg-bg shadow-glow-brand">
              <FishLogo variant="app-icon" className="rk-fish-logo h-full w-full object-cover" priority />
            </span>
            <span className="rk-fish-bubble rk-fish-bubble-one absolute left-5 top-5 h-1.5 w-1.5 rounded-full bg-accent/75" />
            <span className="rk-fish-bubble rk-fish-bubble-two absolute right-5 top-8 h-1 w-1 rounded-full bg-brand-strong/80" />
          </div>

          <h3 className="mb-1 text-base font-semibold text-fg">
            {locale === "en" ? "Finfold is rebuilding your content…" : "Finfold 正在重构内容…"}
          </h3>
          <p className="mb-3 max-w-xs text-xs leading-relaxed text-fg-muted">
            {locale === "en"
              ? "Running multi-channel layout analysis, brand compliance checks, and growth goal mapping"
              : "进行多渠道排版分析、品牌合规规则及增长目标映射"}
          </p>

          <p className="mb-8 text-xs font-medium text-fg-muted">
            {elapsedSeconds < estimatedSeconds
              ? locale === "en"
                ? `Estimated time: about ${estimatedSeconds}s · ${elapsedSeconds}s elapsed`
                : `预计用时约 ${estimatedSeconds} 秒 · 已等待 ${elapsedSeconds} 秒`
              : locale === "en"
                ? `Taking longer than usual (${elapsedSeconds}s) — still working, please wait…`
                : `比预期稍久（已等待 ${elapsedSeconds} 秒）— 仍在生成中，请继续等待…`}
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

      {isActive && outputs.length > 0 ? (
        <GenerationProgress arrived={outputs.length} total={totalExpected} elapsedSeconds={elapsedSeconds} locale={locale} />
      ) : null}

      {outputs.length === 0 && !isActive ? (
        <div className="relative flex min-h-[360px] flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-hairline bg-surface-2 p-5 text-center sm:p-8 lg:min-h-[540px]">
          <div aria-hidden className="grain-local pointer-events-none absolute inset-0" />
          {/* Free-library Lottie (LottieFiles, Lottie Simple License) —
              内容创作插画，引导用户产出第一条内容 */}
          <BrandLottie
            src="/lottie/content-writing.json"
            className="pointer-events-none relative mb-2 aspect-square w-44 sm:w-52"
          />
          <p className="relative text-sm font-semibold text-fg">{copy.emptyTitle}</p>
          <p className="relative mt-1.5 max-w-sm text-xs leading-5 text-fg-muted">
            {copy.emptyBody}
          </p>
        </div>
      ) : null}

      {/* 移动端：横向 pill 切换平台，一次只看一个；桌面端展示全部 */}
      {outputs.length > 1 && !isLoading ? (
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
          {outputs.map((output) => {
            const platform = getPlatform(output.platform);
            const active = activeMobile === output.platform;
            return (
              <button
                key={output.platform}
                type="button"
                onClick={() => setMobileActivePlatform(output.platform)}
                className={`focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-brand-strong bg-gradient-to-br from-brand-strong to-brand text-bg"
                    : "border-hairline bg-surface text-fg-muted"
                }`}
              >
                <PlatformGlyph platform={output.platform} className="h-3.5 w-3.5" />
                {platform.shortLabel}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
        {outputs.map((output) => {
          const platform = getPlatform(output.platform);
          const displayTitle = displayContentTitle(output.title, locale);
          const copied = copiedPlatform === output.platform;
          const locked = !canUseOutputs;
          const effectiveBody = output.finalBody ?? output.body;
          const previewBody = locked ? createPreview(effectiveBody) : effectiveBody;
          const mode = viewModes[output.platform] ?? "preview"; // Default to premium simulated preview
          const isEditing = editingPlatform === output.platform;
          const isSaving = savingPlatform === output.platform;
          const isPolishing = polishingPlatform === output.platform;
          const isPosting = postingPlatform === output.platform;
          const canEdit = Boolean(kitId && output.id);
          const visualPlan = buildVisualIntelligencePlan(output, locale, brandBrain);
          const illustrationPlan = buildArticleIllustrationPlan(output, output.platform, locale, visualPlan, brandBrain);
          const readiness = assessContentReadiness(
            output,
            locale,
            growthMission?.platform === output.platform ? growthMission : null
          );

          return (
            <article key={output.platform} data-testid={`output-card-${output.platform}`} className={`panel panel-hover min-w-0 p-3 sm:p-4 ${activeMobile && activeMobile !== output.platform ? "hidden lg:block" : ""}`}>
              <div className="mb-4 flex flex-col gap-3 border-b border-hairline pb-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-fg-muted">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-surface-2 text-fg">
                      <PlatformGlyph platform={output.platform} className="h-3.5 w-3.5" />
                    </span>
                    <span className="whitespace-nowrap">{platform.label}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 break-words text-base font-semibold leading-tight text-fg">{displayTitle}</h3>
                    <span className="tag tag-success">{locale === "en" ? "Open" : "开放预览"}</span>
                    <span className={PUBLISHED_STATES.has(output.publishStatus) ? "tag tag-success" : "tag tag-neutral"}>
                      {publishStatusLabel(output.publishStatus ?? "draft", locale)}
                    </span>
                    {output.userEdited ? (
                      <span className="tag tag-neutral">{locale === "en" ? "Edited" : "已编辑"}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-2">
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

                  {canEdit ? (
                    <button
                      type="button"
                      data-testid={`edit-output-${output.platform}`}
                      onClick={() => (isEditing ? cancelEditing() : startEditing(output))}
                      className="btn-ghost focus-ring px-3 py-1.5 text-xs"
                    >
                      {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                      {isEditing ? (locale === "en" ? "Cancel" : "取消") : locale === "en" ? "Edit" : "编辑"}
                    </button>
                  ) : null}

                  {canEdit && !isEditing ? (
                    <button
                      type="button"
                      onClick={() => void polishOutput(output)}
                      disabled={isPolishing}
                      title={!canPolish ? (locale === "en" ? "Requires Pro plan or above" : "需要 Pro 及以上套餐") : undefined}
                      className="btn-ghost focus-ring px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                      {isPolishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                      {locale === "en" ? "Polish" : "Polish 润色"}
                    </button>
                  ) : null}

                  {canEdit && !isEditing ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRegenOpenFor(regenOpenFor === output.platform ? null : output.platform);
                        setRegenDirection("");
                      }}
                      disabled={regeneratingPlatform === output.platform}
                      className="btn-ghost focus-ring px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                      {regeneratingPlatform === output.platform ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {locale === "en" ? "Regenerate" : "重新生成"}
                    </button>
                  ) : null}

                  {canEdit && !isEditing ? (
                    isPosting ? (
                      <span role="status" className="inline-flex items-center gap-1.5 rounded-md border border-action/25 bg-action/[0.1] px-3 py-1.5 text-xs font-bold text-action-strong dark:text-action">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {locale === "en" ? "Marking…" : "正在标记…"}
                      </span>
                    ) : PUBLISHED_STATES.has(output.publishStatus) ? (
                      <span role="status" className="inline-flex items-center gap-1.5 rounded-md border border-positive/25 bg-positive/10 px-3 py-1.5 text-xs font-bold text-positive">
                        <Check className="h-3.5 w-3.5" />
                        {locale === "en" ? "Published" : "已发布"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        data-testid={`mark-published-${output.platform}`}
                        onClick={() => void markOutputPosted(output)}
                        className="btn-ghost focus-ring px-3 py-1.5 text-xs"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {locale === "en" ? "Mark published" : "标记已发布"}
                      </button>
                    )
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void copyOutput(output)}
                    className="btn-ghost focus-ring px-3 py-1.5 text-xs"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
                    {locked ? copy.unlockCopy : copied ? copy.copied : copy.copy}
                  </button>
                </div>

                {!PUBLISHED_STATES.has(output.publishStatus) && cadenceWarnings[output.platform] ? (
                  <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs font-medium text-warn">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{formatCadenceWarning(cadenceWarnings[output.platform], locale)}</span>
                  </p>
                ) : null}

                {!PUBLISHED_STATES.has(output.publishStatus) ? (
                  <ToneDriftAlert
                    assessment={output.id ? toneAssessments[output.id] : undefined}
                    isLoading={toneChecksLoading && Boolean(output.id)}
                    locale={locale}
                    onUseDirection={(direction) => {
                      setRegenOpenFor(output.platform);
                      setRegenDirection(direction);
                      captureEvent("tone_drift_direction_applied", { platform: output.platform });
                    }}
                  />
                ) : null}

                {saveError && !isEditing ? (
                  <p role="alert" className="rounded-lg border border-risk/25 bg-risk/10 px-3 py-2 text-xs font-medium text-risk">
                    {saveError}
                  </p>
                ) : null}

                {regenOpenFor === output.platform ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-action/20 bg-action/[0.05] p-2">
                    <input
                      value={regenDirection}
                      onChange={(e) => setRegenDirection(e.target.value)}
                      placeholder={locale === "en" ? "Optional direction (e.g. punchier hook)…" : "可选方向（如：开头更犀利）…"}
                      className="focus-ring w-full min-w-0 rounded-md bg-surface px-2.5 py-2 text-xs text-fg sm:w-auto sm:min-w-[12rem] sm:flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => void regenerateOutput(output)}
                      disabled={regeneratingPlatform === output.platform}
                      className="btn-primary focus-ring px-2.5 py-1.5 text-xs disabled:opacity-50"
                    >
                      {regeneratingPlatform === output.platform ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      {locale === "en" ? "Go" : "生成"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRegenOpenFor(null); setRegenDirection(""); }}
                      className="btn-ghost focus-ring px-2.5 py-1.5 text-xs"
                    >
                      {locale === "en" ? "Cancel" : "取消"}
                    </button>
                  </div>
                ) : null}
              </div>

              <ContentReadinessCard
                report={readiness}
                locale={locale}
                isImproving={improvingPlatform === output.platform}
                onImprove={() => {
                  captureEvent("content_readiness_action", {
                    platform: output.platform,
                    score: readiness.score,
                    skill: readiness.skillPlan.id,
                    blocker: readiness.primaryBlocker.key
                  });
                  if (readiness.status !== "ready") {
                    const direction = locale === "en"
                      ? `Fix only the weakest pre-publish signal, “${readiness.primaryBlocker.label}”: ${readiness.primaryBlocker.action}. Preserve the topic, verified facts, and voice; do not invent evidence.`
                      : `只修复发布前质量判断中的最低分项「${readiness.primaryBlocker.label}」：${readiness.primaryBlocker.action}。保留原主题、真实事实和语气，不要编造证据。`;
                    void regenerateOutput(output, { direction, mode: "improve" });
                  } else if (readiness.skillPlan.primaryAction === "publication") setPublicationFor(output.platform);
                  else if (readiness.skillPlan.primaryAction === "cover") openCoverStudio(output.platform);
                  else if (readiness.skillPlan.primaryAction === "illustrations") setIllustrationFor(output.platform);
                  else setVisualStoryFor(output.platform);
                }}
              />

              {output.platform === "xiaohongshu" ? (
                <XhsImageComplianceAlert
                  assets={mediaAssets}
                  locale={locale}
                  confirmOpen={qrConfirmationFor === output.platform}
                  onReviewMedia={onReviewMedia}
                  onConfirm={() => void markOutputPosted(output, { qrRiskConfirmed: true })}
                />
              ) : null}

              <VisualAssetPlanCard
                plan={visualPlan}
                locale={locale}
                onOpenPrimary={() => {
                  captureEvent("visual_plan_opened", { platform: output.platform, asset_kind: visualPlan.assetKind });
                  if (visualPlan.primaryStudio === "story") setVisualStoryFor(output.platform);
                  else openCoverStudio(output.platform);
                }}
                onOpenCover={() => openCoverStudio(output.platform)}
                onOpenStory={() => setVisualStoryFor(output.platform)}
                illustrationCount={illustrationPlan.briefs.length}
                onOpenIllustrations={() => setIllustrationFor(output.platform)}
              />

              {/* AI-Generated Cover Image is rendered in-context inside the
                  SocialMockup below (Preview mode) so users see the image as it
                  actually appears in each platform's post. Do NOT render a second
                  standalone <img> here — earlier that duplicated the image and,
                  because the mockups had no aspect-ratio bound, the in-mockup
                  copy blew up to fill the card (the "huge icon" bug). */}

              {isEditing ? (
                <div className="grid gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-fg">
                      {locale === "en" ? "Title (optional)" : "标题（可留空）"}
                    </span>
                    <input
                      data-testid={`output-title-editor-${output.platform}`}
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      placeholder={locale === "en" ? "Leave blank to show “Untitled”" : "留空时显示“无标题”"}
                      className="focus-ring panel-inset w-full rounded-lg px-3 py-2.5 text-sm text-fg"
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-fg">{locale === "en" ? "Body" : "正文"}</span>
                  <textarea
                    ref={textareaRef}
                    data-testid={`output-editor-${output.platform}`}
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    rows={10}
                    className="focus-ring panel-inset w-full resize-y rounded-lg p-3 text-sm leading-6 text-fg"
                  />
                  </label>
                  {/* 划词 AI 微编辑（P0-2）：选中文字 → 选方向，仅替换选区。 */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-fg-muted">{locale === "en" ? "Select text →" : "选中文字 →"}</span>
                    {REFINE_ACTIONS.map((act) => (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => void refineSelection(output, act.id)}
                        disabled={refiningAction === act.id}
                        className="focus-ring rounded-md border border-hairline bg-surface px-2 py-1 text-[11px] font-medium text-fg-muted transition hover:text-fg disabled:opacity-50"
                      >
                        {refiningAction === act.id ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
                        {locale === "en" ? act.en : act.zh}
                      </button>
                    ))}
                  </div>
                  {refineWarn?.length ? (
                    <p className="text-xs font-medium text-risk">
                      {locale === "en" ? `Banned phrase hit: ${refineWarn.join(", ")}` : `命中禁用词：${refineWarn.join("、")}`}
                    </p>
                  ) : null}

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-fg">{locale === "en" ? "Call to action" : "行动引导"}</span>
                    <input
                      data-testid={`output-cta-editor-${output.platform}`}
                      value={draftCta}
                      onChange={(e) => setDraftCta(e.target.value)}
                      className="focus-ring panel-inset w-full rounded-lg px-3 py-2.5 text-sm text-fg"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid={`save-output-${output.platform}`}
                      onClick={() => void saveEdit(output)}
                      disabled={isSaving || draftBody.trim().length === 0 || draftCta.trim().length === 0}
                      className="btn-primary focus-ring px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      {locale === "en" ? "Save" : "保存"}
                    </button>
                    <button type="button" onClick={cancelEditing} className="btn-ghost focus-ring px-3 py-1.5 text-xs">
                      {locale === "en" ? "Cancel" : "取消"}
                    </button>
                  </div>
                </div>
              ) : mode === "preview" ? (
                <div className="flex justify-center rounded-xl border border-hairline bg-surface-2 p-3 sm:p-4">
                  <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-hairline bg-white font-sans shadow-raised">
                    {/* High Fidelity Simulated Preview */}
                    <SocialMockup
                      platform={output.platform}
                      title={displayTitle}
                      body={previewBody}
                      cta={locked ? copy.lockedCtaPreview : output.cta}
                      notes={locked ? copy.lockedNotesPreview : output.notes}
                      locked={locked}
                      imageUrl={output.imageUrl}
                      locale={locale}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 text-sm leading-6">
                  <ContentBlock label={copy.body} value={previewBody} locked={locked} locale={locale} />
                  <ContentBlock label={copy.cta} value={locked ? copy.lockedCtaPreview : output.cta} />
                  <ContentBlock label={copy.notes} value={locked ? copy.lockedNotesPreview : output.notes} />
                  <ContentBlock label={copy.strategy} value={locked ? createPreview(output.strategy) : output.strategy} />
                </div>
              )}

              {canEdit && output.id ? (
                <OutputFeedback
                  locale={locale}
                  saved={feedbackByOutput[output.id]}
                  selectedReasons={feedbackReasons[output.id] ?? []}
                  open={feedbackOpenFor === output.id}
                  saving={feedbackSavingFor === output.id}
                  error={feedbackError?.outputId === output.id ? feedbackError.message : null}
                  onHelpful={() => void saveFeedback(output, "helpful")}
                  onUnhelpful={() => {
                    setFeedbackError(null);
                    setFeedbackOpenFor(output.id!);
                  }}
                  onToggleReason={(reason) => toggleFeedbackReason(output.id!, reason)}
                  onSaveReasons={() => void saveFeedback(output, "unhelpful")}
                  onCancel={() => setFeedbackOpenFor(null)}
                />
              ) : null}
            </article>
          );
        })}

        {pendingPlatforms.map((platformId) => {
          const pendingPlatform = getPlatform(platformId);
          return (
            <PendingPlatformCard key={platformId} platformId={platformId} label={pendingPlatform.label} locale={locale} />
          );
        })}
      </div>

      {coverFor ? (
        <CoverStudio
          output={outputs.find((output) => output.platform === coverFor)!}
          platform={coverFor}
          locale={locale}
          kitId={kitId}
          canExport={canUseOutputs}
          onLockedExport={() => onLockedAction?.("export")}
          onClose={() => setCoverFor(null)}
          onSaveCover={(imageUrl) => {
            onOutputSaved?.(coverFor, { imageUrl });
            captureEvent("cover_saved", { platform: coverFor });
          }}
          brandBrain={brandBrain}
          referenceImageUrl={referenceImageUrl}
        />
      ) : null}

      {visualStoryFor ? (
        <VisualStoryStudio
          output={outputs.find((output) => output.platform === visualStoryFor)!}
          platform={visualStoryFor}
          locale={locale}
          kitId={kitId}
          plan={buildVisualIntelligencePlan(outputs.find((output) => output.platform === visualStoryFor)!, locale, brandBrain)}
          canExport={canUseOutputs}
          onLockedExport={() => onLockedAction?.("export")}
          onCoverSaved={(imageUrl) => {
            onOutputSaved?.(visualStoryFor, { imageUrl });
            captureEvent("cover_saved_from_visual_story", { platform: visualStoryFor });
          }}
          brandBrain={brandBrain}
          referenceImageUrl={referenceImageUrl}
          onClose={() => setVisualStoryFor(null)}
        />
      ) : null}

      {illustrationFor ? (() => {
        const output = outputs.find((item) => item.platform === illustrationFor)!;
        const visualPlan = buildVisualIntelligencePlan(output, locale, brandBrain);
        const illustrationPlan = buildArticleIllustrationPlan(output, illustrationFor, locale, visualPlan, brandBrain);
        return (
          <ArticleIllustrationStudio
            output={output}
            platform={illustrationFor}
            locale={locale}
            visualPlan={visualPlan}
            illustrationPlan={illustrationPlan}
            referenceImageUrl={referenceImageUrl || brandBrain.visualIdentity.referenceImageUrls[0] || output.imageUrl || undefined}
            kitId={kitId}
            onAssetsChanged={(visualAssets) => {
              onOutputSaved?.(output.platform, { visualAssets });
              captureEvent("visual_asset_saved", { platform: output.platform, count: visualAssets.length });
            }}
            onClose={() => setIllustrationFor(null)}
          />
        );
      })() : null}

      {publicationFor ? (
        <PublicationStudio
          output={outputs.find((output) => output.platform === publicationFor)!}
          locale={locale}
          canExport={canUseOutputs}
          onLockedExport={() => onLockedAction?.("export")}
          onClose={() => setPublicationFor(null)}
        />
      ) : null}
    </section>
  );
}

function OutputFeedback({
  locale,
  saved,
  selectedReasons,
  open,
  saving,
  error,
  onHelpful,
  onUnhelpful,
  onToggleReason,
  onSaveReasons,
  onCancel
}: {
  locale: Locale;
  saved?: SavedFeedback;
  selectedReasons: FeedbackReason[];
  open: boolean;
  saving: boolean;
  error: string | null;
  onHelpful: () => void;
  onUnhelpful: () => void;
  onToggleReason: (reason: FeedbackReason) => void;
  onSaveReasons: () => void;
  onCancel: () => void;
}) {
  const reasonCopy: Record<FeedbackReason, { zh: string; en: string }> = {
    generic: { zh: "太泛", en: "Too generic" },
    off_brand: { zh: "不像我的品牌", en: "Off brand" },
    weak_hook: { zh: "开头不够强", en: "Weak hook" },
    platform_fit: { zh: "不像平台原生内容", en: "Poor platform fit" },
    inaccurate: { zh: "内容不准确", en: "Inaccurate" },
    weak_cta: { zh: "行动引导太弱", en: "Weak CTA" }
  };

  return (
    <div className="mt-4 border-t border-hairline pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-fg">{locale === "en" ? "Should Finfold learn from this output?" : "这条结果值得 Finfold 学习吗？"}</p>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            {saved
              ? locale === "en" ? "Saved to your private growth memory." : "已写入你的私有增长记忆。"
              : locale === "en" ? "One click improves future generations." : "一次选择会影响后续生成。"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onHelpful}
            disabled={saving}
            aria-pressed={saved?.rating === "helpful"}
            className={`focus-ring inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${saved?.rating === "helpful" ? "border-action/35 bg-action/[0.1] text-action-strong dark:text-action" : "border-hairline bg-surface text-fg-muted hover:text-fg"}`}
          >
            {saving && !open ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
            {locale === "en" ? "Useful" : "有用"}
          </button>
          <button
            type="button"
            onClick={onUnhelpful}
            disabled={saving}
            aria-pressed={saved?.rating === "unhelpful"}
            className={`focus-ring inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${saved?.rating === "unhelpful" ? "border-risk/35 bg-risk/10 text-risk" : "border-hairline bg-surface text-fg-muted hover:text-fg"}`}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            {locale === "en" ? "Needs work" : "需要改进"}
          </button>
        </div>
      </div>

      {error && !open ? <p className="mt-2 text-xs font-medium text-risk">{error}</p> : null}

      {open ? (
        <div className="mt-3 rounded-xl border border-risk/20 bg-risk/5 p-3">
          <p className="text-xs font-semibold text-fg">{locale === "en" ? "What should change next time? Choose up to 3." : "下次应该改进什么？最多选择 3 项。"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FEEDBACK_REASONS.map((reason) => {
              const selected = selectedReasons.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => onToggleReason(reason)}
                  aria-pressed={selected}
                  className={`focus-ring rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${selected ? "border-risk/35 bg-risk/12 text-risk" : "border-hairline bg-surface text-fg-muted hover:text-fg"}`}
                >
                  {reasonCopy[reason][locale]}
                </button>
              );
            })}
          </div>
          {error ? <p className="mt-2 text-xs font-medium text-risk">{error}</p> : null}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onSaveReasons} disabled={saving || selectedReasons.length === 0} className="btn-primary focus-ring px-3 py-1.5 text-xs disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {locale === "en" ? "Teach Finfold" : "让 Finfold 学会"}
            </button>
            <button type="button" onClick={onCancel} disabled={saving} className="btn-ghost focus-ring px-3 py-1.5 text-xs">
              {locale === "en" ? "Cancel" : "取消"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GenerationProgress({ arrived, total, elapsedSeconds, locale }: { arrived: number; total: number; elapsedSeconds: number; locale: Locale }) {
  const safeTotal = Math.max(total, arrived, 1);
  const pct = Math.min(100, Math.round((arrived / safeTotal) * 100));
  return (
    <div className="sticky top-0 z-20 mb-4 rounded-xl border border-action/25 bg-surface p-3 shadow-panel">
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 font-semibold text-fg">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-action" />
          {locale === "en" ? `Generating platform copy… ${arrived}/${safeTotal} ready` : `正在生成平台文案… ${arrived}/${safeTotal} 已就绪`}
        </div>
        <span className="text-fg-muted">{elapsedSeconds}s</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-action transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">
        {locale === "en" ? "Drafts are ready to read, edit, and copy as soon as they appear below." : "下方草稿一经出现，即可阅读、编辑和复制。"}
      </p>
    </div>
  );
}

function PendingPlatformCard({ platformId, label, locale }: { platformId: PlatformId; label: string; locale: Locale }) {
  // 桌面端显示排队占位卡，强化"逐个就绪"进度感；移动端靠顶部进度条传达，
  // 不渲染占位卡以免与移动端单平台聚焦视图冲突。
  return (
    <article className="panel relative hidden overflow-hidden p-4 lg:block" aria-busy="true">
      <div className="mb-4 flex items-center gap-2 border-b border-hairline pb-3.5 text-xs font-semibold text-fg-muted">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-surface-2 text-fg">
          <PlatformGlyph platform={platformId} className="h-3.5 w-3.5" />
        </span>
        <span className="whitespace-nowrap">{label}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-action-strong dark:text-action">
          <Loader2 className="h-3 w-3 animate-spin" />
          {locale === "en" ? "Generating…" : "生成中…"}
        </span>
      </div>
      <div className="space-y-2.5" aria-hidden="true">
        <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-surface-2" />
      </div>
    </article>
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

function ContentBlock({ label, value, locked = false, locale = "en" }: { label: string; value: string; locked?: boolean; locale?: Locale }) {
  return (
    <div className="panel-inset p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">{label}</p>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-fg">{value}</p>
      {locked ? (
        <p className="mt-3 rounded-lg border border-warn/30 bg-warn/10 p-2.5 text-xs font-medium text-warn">
          {locale === "zh" ? "展示模式已开放全文、转化动作、备注、导出和分析能力，可直接检查完整效果。" : "Showcase mode is open: full copy, CTA, notes, export, and analysis are available for review."}
        </p>
      ) : null}
    </div>
  );
}

/** Renders a CadenceWarning (lib/publish-cadence.ts) as one sentence — e.g.
 * "今天已在小红书发布 2 篇，再发有限流风险 — 建议 4 小时后再发布。" — for the
 * warning chip shown next to the "Mark published" button. */
function formatCadenceWarning(warning: CadenceWarning, locale: Locale): string {
  const platformLabel = getPlatform(warning.platform).label;
  if (locale === "en") {
    return warning.reason === "window"
      ? `You've posted ${warning.postsInWindow} times on ${platformLabel} recently — posting again risks being flagged. Wait about ${warning.hoursUntilSafe}h.`
      : `You just posted on ${platformLabel} — posting again this soon risks being flagged. Wait about ${warning.hoursUntilSafe}h.`;
  }
  return warning.reason === "window"
    ? `最近已在${platformLabel}发布 ${warning.postsInWindow} 篇，再发有限流风险 — 建议约 ${warning.hoursUntilSafe} 小时后再发布。`
    : `刚在${platformLabel}发布过，间隔太短有限流风险 — 建议约 ${warning.hoursUntilSafe} 小时后再发布。`;
}

function createPreview(body: string): string {
  const limit = Math.max(180, Math.round(body.length * 0.28));
  return body.length > limit ? `${body.slice(0, limit).trim()}...` : body;
}

/**
 * 外化"越用越懂你"（P0-5）：把本次生成实际注入 prompt 的品牌上下文计数渲染成
 * 可展开的胶囊。数据来自 /api/generate 的 done 事件 usedContext，由
 * buildBrainPromptSection 真实注入字段回采，不得编造。无任何品牌上下文时
 * 显示引导去填写品牌记忆的 CTA，而非空胶囊。
 */
function ContextCapsule({ ctx, locale }: { ctx: UsedContext; locale: Locale }) {
  const [expanded, setExpanded] = useState(false);

  const items: Array<{ key: string; count: number; zh: string; en: string }> = [
    { key: "tone", count: ctx.toneKeywords, zh: "语气词", en: "tone words" },
    { key: "banned", count: ctx.bannedPhrases, zh: "禁用词", en: "banned phrases" },
    { key: "style", count: ctx.learnedStyle, zh: "学到的风格", en: "learned style" },
    { key: "negative", count: ctx.learnedNegative, zh: "反模式", en: "anti-patterns" },
    { key: "perf", count: ctx.performanceRules, zh: "表现规则", en: "perf rules" },
    { key: "examples", count: ctx.approvedExamples, zh: "参考范文", en: "examples" },
    { key: "custom", count: ctx.customRules, zh: "自定义规则", en: "custom rules" },
    { key: "perfExamples", count: ctx.perfExamples, zh: "高表现范文", en: "top examples" },
    { key: "packs", count: ctx.industryPacks, zh: "行业合规", en: "industry rules" }
  ].filter((item) => item.count > 0);

  const total = items.reduce((sum, item) => sum + item.count, 0);

  // 无任何品牌上下文 → CTA 引导填写，而不是显示空胶囊。
  if (!ctx.hasBrand && total === 0) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-warn/30 bg-warn/5 p-2.5 text-xs text-fg-muted">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-warn" />
        <span>{locale === "en" ? "No brand memory yet — results will be more generic." : "尚未填写品牌记忆，生成结果偏通用。"}</span>
        <a href="/brand-memory" className="ml-auto shrink-0 font-semibold text-action-strong hover:underline dark:text-action">
          {locale === "en" ? "Set up →" : "去填写 →"}
        </a>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-action/20 bg-action/[0.05] p-2.5">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="focus-ring flex w-full items-center gap-2 rounded text-left text-xs"
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-action-strong dark:text-action" />
        <span className="font-semibold text-fg">
          {locale === "en" ? "This kit used your brand context" : "本次生成参考了你的品牌上下文"}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-fg-muted">
          {locale === "en" ? `${total} signals` : `共 ${total} 条`}
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </span>
      </button>
      {expanded ? (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-action/15 pt-2">
          {items.map((item) => (
            <span
              key={item.key}
              className="inline-flex items-center gap-1 rounded-full border border-action/20 bg-surface px-2 py-0.5 text-[11px] font-medium text-fg-muted"
            >
              <span className="font-bold text-action-strong dark:text-action">{item.count}</span>
              {locale === "en" ? item.en : item.zh}
            </span>
          ))}
        </div>
      ) : null}
      {expanded ? <FiredRules rules={ctx.rules} locale={locale} /> : null}
    </div>
  );
}

/**
 * 溯源明细："为什么这样写有效" — 展开胶囊后，把本次实际命中的学习规则原文
 * 列出来（而不只是数量），让用户看到机器记住的是哪句具体的话。数据直接来自
 * usedContext.rules（服务端从 input.brandBrain 回采，不编造）。三类规则来源
 * 不同（编辑蒸馏 / 低表现负学习 / 采纳的迭代建议），用不同色点区分。
 */
function FiredRules({ rules, locale }: { rules: UsedContext["rules"]; locale: Locale }) {
  if (!rules) return null;

  const groups: Array<{ key: string; texts: string[]; dot: string; zh: string; en: string }> = [
    { key: "style", texts: rules.learnedStyle, dot: "bg-brand", zh: "学到的风格", en: "Learned style" },
    { key: "negative", texts: rules.learnedNegative, dot: "bg-risk", zh: "避免的反模式", en: "Avoided anti-pattern" },
    { key: "perf", texts: rules.performanceRules, dot: "bg-accent", zh: "采纳的表现建议", en: "Adopted perf rule" }
  ].filter((group) => group.texts.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5 border-t border-action/15 pt-2">
      {groups.map((group) =>
        group.texts.map((text, index) => (
          <div key={`${group.key}-${index}`} className="flex items-start gap-2 text-[11px] text-fg-muted">
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${group.dot}`} aria-hidden="true" />
            <span>
              <span className="font-semibold text-fg-muted/80">{locale === "en" ? group.en : group.zh}: </span>
              {text}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
