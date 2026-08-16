"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileStack,
  Loader2,
  LogIn,
  Paperclip,
  RotateCcw,
  SlidersHorizontal,
  Square,
  WandSparkles,
  X
} from "@/components/ui/icons";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { UsageMeter } from "@/components/billing/UsageMeter";
import { buttonStyles } from "@/components/ui/Button";
import { DismissButton, useDismissable } from "@/components/ui/Dismissible";
import { captureEvent } from "@/lib/posthog";
import { getBrandBrain } from "@/lib/brand-brain";
import { GoalSelector } from "@/components/workbench/GoalSelector";
import { FirstKitGuide } from "@/components/workbench/FirstKitGuide";
import { IdeaInput } from "@/components/workbench/IdeaInput";
import { KitLifecycle } from "@/components/workbench/KitLifecycle";
import { MediaUploader } from "@/components/workbench/MediaUploader";
import { OutputBoard } from "@/components/workbench/OutputBoard";
import { PerformancePanel } from "@/components/workbench/PerformancePanel";
import { PersonaSelector } from "@/components/workbench/PersonaSelector";
import { QualityScorePanel } from "@/components/workbench/QualityScorePanel";
import { PlatformSelector } from "@/components/workbench/PlatformSelector";
import { UpgradeGate } from "@/components/workbench/UpgradeGate";
import { useWorkbench } from "@/components/workbench/WorkbenchProvider";
import { dashboardCopy } from "@/lib/i18n";
import {
  getMobileGenerationEstimate,
  getMobileSourceGuidance,
  isMobileSourceReady,
  type MobileWorkbenchStep
} from "@/lib/mobile-workbench";
import { growthMissionIdSchema, platformIdSchema, xhsWorkflowIdSchema } from "@/lib/content-schema";
import { ACTION_CREDITS, computeKitCost } from "@/lib/payment/types";
import { MAX_PLATFORMS_PER_GENERATION } from "@/lib/platforms";
import type { PlatformId } from "@/lib/platforms";
import { WorkbenchReferralPrompts } from "@/components/referrals/WorkbenchReferralPrompts";
import { GrowthMissionBanner } from "@/components/workbench/GrowthMissionBanner";
import { OPEN_GLOBAL_AGENT_EVENT } from "@/lib/agent/presentation";
import {
  generationRunStepLabel,
  isGenerationRunActive
} from "@/lib/generation-run-client";
import { buildXhsWorkbenchSource } from "@/lib/agent/xhs-coaching";

type WorkbenchBootstrap = {
  idea: string;
  platform: PlatformId | null;
  missionId: string | null;
  workflowId: string | null;
  artifactVersionIds: string[];
  coachingLink: { programId: string; taskId: string } | null;
};

export function DashboardWorkbench() {
  const {
    locale,
    ideaText,
    setIdeaText,
    goal,
    setGoal,
    persona,
    setPersona,
    selectedPlatforms,
    setSelectedPlatforms,
    withImage,
    setWithImage,
    mediaAssets,
    setMediaAssets,
    outputs,
    kits,
    activeKitId,
    growthMissionId,
    setGrowthMissionId,
    xhsWorkflowId,
    setXhsWorkflowId,
    artifactVersionIds,
    setArtifactVersionIds,
    allowance,
    usedContext,
    entitlement,
    canvasRestoreComplete,
    isLoading,
    isRecoveringGeneration,
    generationRun,
    error,
    canGenerate,
    generateDisabledReason,
    currentKit,
    generateKit,
    cancelGeneration,
    dismissGenerationRun,
    onOutputSaved
  } = useWorkbench();

  const [gate, setGate] = useState<{ open: boolean; reason: "copy" | "export" | "save" | "analyze" | "iterate" }>({
    open: false,
    reason: "copy"
  });
  const [mobileStep, setMobileStep] = useState<MobileWorkbenchStep>(1);
  const [xhsCoachingLink, setXhsCoachingLink] = useState<{ programId: string; taskId: string } | null>(null);
  const [pendingBootstrap, setPendingBootstrap] = useState<WorkbenchBootstrap | null>(null);
  const didApplyUrlBootstrapRef = useRef(false);
  const { dismissed: agentPromoDismissed, dismiss: dismissAgentPromo } = useDismissable(
    "finfold-workbench-agent-promo-v1"
  );

  function applyBootstrap(bootstrap: WorkbenchBootstrap) {
    setIdeaText(bootstrap.idea);
    if (bootstrap.platform) setSelectedPlatforms([bootstrap.platform]);
    if (bootstrap.missionId) setGrowthMissionId(bootstrap.missionId);
    if (bootstrap.workflowId) setXhsWorkflowId(bootstrap.workflowId);
    if (bootstrap.artifactVersionIds.length > 0) setArtifactVersionIds(bootstrap.artifactVersionIds);
    if (bootstrap.coachingLink) setXhsCoachingLink(bootstrap.coachingLink);
  }

  useEffect(() => {
    if (!canvasRestoreComplete || didApplyUrlBootstrapRef.current || typeof window === "undefined") return;
    didApplyUrlBootstrapRef.current = true;
    captureEvent("workbench_viewed");

    const params = new URLSearchParams(window.location.search);
    const rawIdea = params.get("idea")?.trim() ?? "";
    if (rawIdea.length < 20) return;
    const platformResult = platformIdSchema.safeParse(params.get("platform"));
    const missionResult = growthMissionIdSchema.safeParse(params.get("missionId"));
    const workflowResult = xhsWorkflowIdSchema.safeParse(params.get("workflowId"));
    const artifactVersionIds = (params.get("artifactIds") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => xhsWorkflowIdSchema.safeParse(item).success)
      .slice(0, 12);
    const coachingProgramResult = xhsWorkflowIdSchema.safeParse(params.get("coachingProgramId"));
    const coachingTaskResult = xhsWorkflowIdSchema.safeParse(params.get("coachingTaskId"));
    const base: Omit<WorkbenchBootstrap, "idea"> = {
      platform: platformResult.success ? platformResult.data : null,
      missionId: missionResult.success ? missionResult.data : null,
      workflowId: workflowResult.success ? workflowResult.data : null,
      artifactVersionIds,
      coachingLink: coachingProgramResult.success && coachingTaskResult.success
        ? { programId: coachingProgramResult.data, taskId: coachingTaskResult.data }
        : null
    };
    const offer = (idea: string) => {
      const bootstrap = { ...base, idea: idea.trim().length >= 20 ? idea : rawIdea };
      if (ideaText.trim().length >= 20 && ideaText.trim() !== bootstrap.idea.trim()) {
        setPendingBootstrap(bootstrap);
      } else {
        applyBootstrap(bootstrap);
      }
    };
    const diagnosisResult = xhsWorkflowIdSchema.safeParse(params.get("diagnosisId"));
    if (!diagnosisResult.success) {
      offer(rawIdea);
      return;
    }

    const controller = new AbortController();
    void fetch(`/api/agent/xhs/diagnoses?id=${encodeURIComponent(diagnosisResult.data)}&limit=1`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { diagnoses?: Array<{ input?: Record<string, unknown> }> };
        offer(response.ok ? buildXhsWorkbenchSource({ idea: rawIdea, diagnosisInput: data.diagnoses?.[0]?.input }) : rawIdea);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        offer(rawIdea);
      });
    return () => controller.abort();
    // URL bootstrap intentionally runs once after the provider restores the durable canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRestoreComplete]);

  useEffect(() => {
    if (isLoading) setMobileStep(3);
  }, [isLoading]);

  const copy = dashboardCopy[locale];
  const sourceReady = isMobileSourceReady(ideaText);
  const sourceGuidance = getMobileSourceGuidance(ideaText, locale);
  const estimatedSeconds = getMobileGenerationEstimate(selectedPlatforms.length);
  const effectivePlatformSelectionLimit = Math.min(
    entitlement.platformLimit ?? MAX_PLATFORMS_PER_GENERATION,
    MAX_PLATFORMS_PER_GENERATION
  );
  const persistedKitId = activeKitId && activeKitId !== "showcase-kit" && activeKitId !== "draft-package" ? activeKitId : null;
  const kitHref = persistedKitId ? `/kits/${persistedKitId}` : "/packages";
  const showFirstKitGuide =
    entitlement.authenticated &&
    kits.length === 0 &&
    outputs.length === 0 &&
    !isLoading &&
    !generationRun;

  const mobileStepCopy = {
    1: {
      title: locale === "en" ? "Add source" : "添加内容",
      subtitle: locale === "en" ? "Start with one source Finfold can adapt." : "先给 Finfold 一份源素材"
    },
    2: {
      title: locale === "en" ? "Choose platforms" : "选择发布平台",
      subtitle: locale === "en" ? "Pick channels, then generate them together." : "先选渠道，下一步一次生成"
    },
    3: {
      title: locale === "en" ? "Generate & edit" : "生成与编辑",
      subtitle: locale === "en" ? "Switch platforms and refine each draft." : "切换平台，继续编辑每一份草稿"
    }
  } as const;

  function goToMobileStep(step: MobileWorkbenchStep) {
    setMobileStep(step);
    captureEvent("workbench_mobile_step_viewed", { step });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function startMobileGeneration() {
    if (!canGenerate) return;
    goToMobileStep(3);
    await generateKit();
  }

  function focusFirstSource() {
    goToMobileStep(1);
    window.requestAnimationFrame(() => {
      const source = document.getElementById("workbench-source");
      source?.scrollIntoView({ behavior: "smooth", block: "start" });
      source?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
  }

  function openAgent() {
    window.dispatchEvent(new Event(OPEN_GLOBAL_AGENT_EVENT));
  }

  function reviewMediaAssets() {
    goToMobileStep(1);
    window.requestAnimationFrame(() => {
      const section = document.getElementById("workbench-media");
      if (section instanceof HTMLDetailsElement) section.open = true;
      section?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <div className="grid min-w-0 gap-4 pb-40 sm:gap-6 lg:pb-10">
      {pendingBootstrap ? (
        <section role="status" className="flex flex-col gap-3 rounded-xl border border-warning/35 bg-warning/8 p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-fg">{locale === "en" ? "Keep your current draft?" : "保留当前草稿？"}</p>
            <p className="mt-1 text-xs leading-5 text-fg-muted">{locale === "en" ? "Finfold prepared new task context. It will not replace what you are editing without confirmation." : "Finfold 已准备新的任务素材，确认前不会覆盖你正在编辑的内容。"}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" className={buttonStyles({ variant: "tertiary", size: "sm" })} onClick={() => setPendingBootstrap(null)}>
              {locale === "en" ? "Keep current" : "保留当前"}
            </button>
            <button type="button" className={buttonStyles({ variant: "primary", size: "sm" })} onClick={() => { applyBootstrap(pendingBootstrap); setPendingBootstrap(null); }}>
              {locale === "en" ? "Use Finfold context" : "使用新素材"}
            </button>
          </div>
        </section>
      ) : null}
      {xhsCoachingLink ? (
        <section data-testid="xhs-coaching-workbench-context" className="flex flex-col gap-3 rounded-xl border border-action/30 bg-[linear-gradient(120deg,rgb(var(--action)/0.1),rgb(var(--surface)/0.94))] p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow">{locale === "en" ? "Xiaohongshu coaching experiment" : "小红书陪跑实验"}</p>
            <p className="mt-1 text-sm font-bold text-fg">
              {locale === "en" ? "This draft is attached to one confirmed coaching variable." : "这份草稿已带入本日任务和唯一实验变量。"}
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              {locale === "en" ? "You review and publish it yourself, then return proof to the coaching task." : "由你确认并亲自发布，完成后回到陪跑任务提交证明。"}
            </p>
          </div>
          <Link href="/operations/xiaohongshu" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            {locale === "en" ? "Back to coaching" : "返回小红书陪跑"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      ) : xhsWorkflowId ? (
        <section className="flex flex-col gap-3 rounded-xl border border-action/25 bg-[linear-gradient(120deg,rgb(var(--action)/0.08),rgb(var(--surface)/0.94))] p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow">{locale === "en" ? "Xiaohongshu Agent workflow" : "小红书 Agent 工作流"}</p>
            <p className="mt-1 text-sm font-bold text-fg">
              {locale === "en" ? "The approved topic, title, and visual direction will stay attached to this kit." : "已确认的选题、标题与视觉方向会随内容包一起保存。"}
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              {locale === "en" ? `${artifactVersionIds.length} approved artifacts linked` : `已关联 ${artifactVersionIds.length} 个版本化产物`}
            </p>
          </div>
          <Link href="/dashboard" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            {locale === "en" ? "Back to Agent" : "返回增长 Agent"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      ) : null}
      {growthMissionId ? <GrowthMissionBanner missionId={growthMissionId} locale={locale} /> : null}
      <section className="hidden relative isolate min-w-0 overflow-hidden rounded-md border border-hairline bg-surface p-4 shadow-panel sm:p-5 md:p-6 lg:block">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_20%,rgb(var(--action)/0.1),transparent_30%),linear-gradient(135deg,rgb(var(--info)/0.035),transparent_48%)]" />
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow">{locale === "en" ? "Finfold Workbench" : "Finfold 创作台"}</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-black leading-[0.95] text-fg md:text-6xl">
              {locale === "en" ? "Workbench" : "创作台"}
            </h1>
            {currentKit ? (
              <div className="mt-4 max-w-2xl">
                <KitLifecycle kit={currentKit} locale={locale} compact />
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <UsageMeter used={allowance.used} limit={allowance.limit} plan={allowance.plan} locale={locale} available={allowance.available} status={allowance.status} />
            <Link href="/packages" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              {locale === "en" ? "View Kits" : "查看套件"}
            </Link>
          </div>
        </div>
      </section>

      {!entitlement.authenticated ? (
        <section className="flex flex-col gap-4 rounded-xl border border-action/25 bg-action/[0.07] p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-action/[0.14] text-action-strong dark:text-action">
              <LogIn className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold text-fg">
                {locale === "en" ? "You are previewing the full workbench" : "你正在预览完整创作台"}
              </p>
              <p className="mt-1 text-xs leading-5 text-fg-muted">
                {locale === "en"
                  ? "Explore the interface without an account. A free account is required before any generation API is called."
                  : "无需账户即可浏览界面；真正生成内容前必须登录，免费账户即可使用。"}
              </p>
            </div>
          </div>
          <Link href="/login" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <LogIn className="h-3.5 w-3.5" />
            {locale === "en" ? "Sign in / Sign up free" : "登录 / 免费注册"}
          </Link>
        </section>
      ) : null}

      {showFirstKitGuide ? (
        <FirstKitGuide
          locale={locale}
          sourceLength={ideaText.trim().length}
          platformCount={selectedPlatforms.length}
          onStart={focusFirstSource}
        />
      ) : null}

      <WorkbenchReferralPrompts authenticated={entitlement.authenticated} locale={locale} />

      {agentPromoDismissed ? null : (
        <section className="relative flex min-w-0 flex-col gap-3 rounded-lg border border-action/25 bg-action/[0.055] p-3.5 pr-12 shadow-panel sm:flex-row sm:items-center sm:justify-between">
          <DismissButton
            onClick={() => {
              captureEvent("workbench_agent_promo_dismissed");
              dismissAgentPromo();
            }}
            label={locale === "en" ? "Dismiss" : "关闭"}
          />
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-action/[0.12] text-action-strong dark:text-action">
              <Bot className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-fg">{locale === "en" ? "Ask Finfold Agent about this content" : "让 Finfold Agent 协助这批内容"}</p>
              <p className="mt-1 text-xs leading-5 text-fg-muted">{locale === "en" ? "Review a draft, turn an idea into a workflow, or continue an existing task." : "审阅草稿、把想法变成工作流，或继续已有任务。"}</p>
            </div>
          </div>
          <button type="button" onClick={openAgent} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            <Bot className="h-3.5 w-3.5" />
            {locale === "en" ? "Open Agent" : "打开 Agent"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </section>
      )}

      {generationRun && !isLoading ? (
        <section
          data-trace-id={generationRun.traceId}
          className={`flex flex-col gap-3 rounded-xl border p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between ${
            isGenerationRunActive(generationRun)
              ? "border-action/30 bg-action/[0.08]"
              : "border-risk/30 bg-risk/10"
          }`}
          role="status"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                isGenerationRunActive(generationRun)
                  ? "bg-action/[0.12] text-action-strong dark:text-action"
                  : "bg-risk/15 text-risk"
              }`}
            >
              {isGenerationRunActive(generationRun) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-fg">
                {isGenerationRunActive(generationRun)
                  ? generationRunStepLabel(generationRun.currentStep, locale)
                  : locale === "en"
                    ? "Generation interrupted"
                    : "生成已中断"}
              </p>
              <p className="mt-1 text-xs leading-5 text-fg-muted">
                {isGenerationRunActive(generationRun)
                  ? isRecoveringGeneration
                    ? locale === "en"
                      ? "Checking the durable run and restoring progress…"
                      : "正在查询任务记录并恢复进度…"
                    : locale === "en"
                      ? "This task is still active. Finfold will restore the saved kit when it completes."
                      : "任务仍在执行，完成后会自动恢复已保存的内容包。"
                  : generationRun.creditsRefunded
                    ? locale === "en"
                      ? "The Credits reserved for this attempt were returned. You can retry safely."
                      : "本次预扣的创作点数已经退回，可以安全重试。"
                    : locale === "en"
                      ? "No duplicate charge will be created. Retry when you are ready."
                      : "不会产生重复扣费，你可以准备好后重新生成。"}
              </p>
            </div>
          </div>
          {isGenerationRunActive(generationRun) ? (
            <button
              type="button"
              onClick={() => void cancelGeneration()}
              className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-300"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              {locale === "en" ? "Cancel task" : "取消任务"}
            </button>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              {generationRun.error?.retryable ? (
                <button
                  type="button"
                  onClick={() => void generateKit()}
                  disabled={!canGenerate}
                  className={buttonStyles({ variant: "primary", size: "sm" })}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {locale === "en" ? "Retry safely" : "安全重试"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={dismissGenerationRun}
                aria-label={locale === "en" ? "Dismiss" : "关闭"}
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-md border border-hairline bg-surface text-fg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>
      ) : null}

      <section className="grid gap-4 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          {mobileStep > 1 ? (
            <button
              type="button"
              onClick={() => goToMobileStep((mobileStep - 1) as MobileWorkbenchStep)}
              disabled={isLoading}
              aria-label={locale === "en" ? "Previous step" : "返回上一步"}
              className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-surface text-fg disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <span className="text-base font-bold tracking-tight text-fg">Finfold</span>
          )}
          <span className="text-xs font-semibold text-action-strong dark:text-action">{mobileStep} / 3</span>
        </div>

        <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-1.5" aria-label={locale === "en" ? `Step ${mobileStep} of 3` : `第 ${mobileStep} 步，共 3 步`}>
          {[1, 2, 3].map((step) => (
            <span
              key={step}
              className={`h-1 rounded-full transition-colors ${
                step <= mobileStep ? "bg-action" : "bg-hairline"
              }`}
            />
          ))}
        </div>

        <div>
          <h1 className="text-3xl font-black tracking-tight text-fg">{mobileStepCopy[mobileStep].title}</h1>
          <p className="mt-1 text-sm text-fg-muted">{mobileStepCopy[mobileStep].subtitle}</p>
          {mobileStep === 3 && currentKit ? (
            <div className="mt-3">
              <KitLifecycle kit={currentKit} locale={locale} compact />
            </div>
          ) : null}
          {mobileStep === 1 && outputs.length > 0 ? (
            <button
              type="button"
              onClick={() => goToMobileStep(3)}
              className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-fg-muted transition hover:border-action/40 hover:text-fg"
            >
              <FileStack className="h-3.5 w-3.5 text-action-strong dark:text-action" />
              {locale === "en" ? `Resume ${outputs.length} existing drafts` : `继续编辑已有的 ${outputs.length} 份内容`}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </section>

      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(300px,0.95fr)_minmax(340px,1fr)] 2xl:grid-cols-[minmax(320px,0.9fr)_minmax(340px,0.95fr)_minmax(460px,1.25fr)]">
        <div id="workbench-source" className={`${mobileStep === 1 ? "grid" : "hidden"} workbench-scroll min-w-0 scroll-mt-20 content-start gap-4 lg:grid xl:col-span-2 xl:max-h-[min(860px,calc(100vh-128px))] xl:overflow-y-auto xl:pr-1 2xl:col-span-1`}>
          <div className="hidden items-center gap-2 px-1 lg:flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-fg text-xs font-semibold text-bg">1</span>
            <h2 className="text-sm font-semibold text-fg">{locale === "en" ? "What are you publishing?" : "你要发什么？"}</h2>
          </div>
          <IdeaInput value={ideaText} onChange={setIdeaText} locale={locale} disabled={isLoading} />
          <details id="workbench-media" className="group rounded-lg border border-hairline bg-surface-2/40">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-3 text-sm font-semibold text-fg-muted transition hover:text-fg">
              <span className="flex min-w-0 flex-1 items-center gap-2"><Paperclip className="h-4 w-4 shrink-0" /><span className="break-words">{locale === "en" ? "Add media (optional)" : "添加更多素材（可选）"}</span></span>
              <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
            </summary>
            <div className="px-3 pb-3">
              <MediaUploader assets={mediaAssets} onChange={setMediaAssets} locale={locale} selectedPlatforms={selectedPlatforms} disabled={isLoading} />
            </div>
          </details>
        </div>

        <div className={`${mobileStep === 2 ? "grid" : "hidden"} workbench-scroll min-w-0 content-start gap-3 lg:grid lg:gap-4 xl:max-h-[min(860px,calc(100vh-128px))] xl:overflow-y-auto xl:pr-1`}>
          <div className="hidden items-center gap-2 px-1 lg:flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-fg text-xs font-semibold text-bg">2</span>
            <h2 className="text-sm font-semibold text-fg">{locale === "en" ? "Which channels?" : "发到哪些平台？"}</h2>
          </div>

          <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-hairline bg-surface p-2.5 lg:hidden">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-action/[0.12] text-action-strong dark:text-action">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-fg">{locale === "en" ? "Source ready" : "源素材已就绪"}</span>
              <span className="mt-0.5 block truncate text-[11px] text-fg-muted">
                {ideaText.trim().length} {locale === "en" ? "characters" : "字"}
                {mediaAssets.length > 0 ? ` · ${mediaAssets.length} ${locale === "en" ? "media files" : "份素材"}` : ""}
              </span>
            </span>
            <button type="button" onClick={() => goToMobileStep(1)} className="focus-ring rounded-md px-2 py-1 text-xs font-semibold text-action-strong dark:text-action">
              {locale === "en" ? "Edit" : "编辑"}
            </button>
          </div>

          <PlatformSelector
            value={selectedPlatforms}
            onChange={setSelectedPlatforms}
            locale={locale}
            disabled={isLoading}
            maxSelection={effectivePlatformSelectionLimit}
          />
          {/* AI 配图 opt-in：开启后每平台一张底图，credits 与内容分开单独扣。
              复用全站统一定价 ACTION_CREDITS.standardImage，可随时关闭。
              仅付费账户可见（free plan 不显示此功能）。 */}
          {entitlement.plan !== "free" ? (
            <div className="flex items-center justify-between gap-2.5 rounded-lg border border-hairline bg-surface p-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-fg">
                  {locale === "en" ? "AI cover image" : "AI 配图"}
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-fg-muted">
                  {withImage
                    ? (locale === "en"
                        ? `Billed separately · +${ACTION_CREDITS.standardImage} × ${selectedPlatforms.length} platforms`
                        : `单独计费 · 额外 ${ACTION_CREDITS.standardImage} × ${selectedPlatforms.length} 平台`)
                    : (locale === "en"
                        ? "One AI image per platform. Billed separately. Optional."
                        : "每平台一张 AI 配图，单独计费，可随时关闭。")}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={withImage}
                disabled={isLoading}
                onClick={() => setWithImage(!withImage)}
                className={`focus-ring relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${withImage ? "bg-action" : "bg-hairline"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${withImage ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
          ) : null}
          <details className="group rounded-lg border border-hairline bg-surface-2/40">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-fg-muted transition hover:text-fg">
              <span className="flex min-w-0 flex-1 items-center gap-2"><SlidersHorizontal className="h-4 w-4 shrink-0" /><span className="break-words">{locale === "en" ? "Tone & goal (advanced)" : "语气与目标（高级）"}</span></span>
              <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
            </summary>
            <div className="grid gap-3 px-3 pb-3">
              <PersonaSelector value={persona} onChange={setPersona} locale={locale} disabled={isLoading} />
              <GoalSelector value={goal} onChange={setGoal} locale={locale} disabled={isLoading} />
            </div>
          </details>
        </div>

        <div className={`${mobileStep === 3 ? "grid" : "hidden"} min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 lg:grid`}>
          <div className="flex min-w-0 items-start justify-between gap-3 px-1">
            <div className="min-w-0">
              <div className="hidden items-center gap-2 lg:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-fg text-xs font-semibold text-bg">3</span>
                <h2 className="text-sm font-semibold text-fg">{locale === "en" ? "Platform Content Kit" : "各平台内容"}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:hidden">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${isLoading ? "border-action/35 bg-action/[0.1] text-action-strong dark:text-action" : outputs.length > 0 ? "border-positive/35 bg-positive/10 text-positive" : "border-hairline bg-surface text-fg-muted"}`}>
                  {isLoading ? <Clock3 className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  {isLoading
                    ? (locale === "en" ? "Generating content" : "正在生成内容")
                    : outputs.length > 0
                      ? (locale === "en" ? `${outputs.length} drafts ready` : `${outputs.length} 个平台内容已生成`)
                      : (locale === "en" ? "Ready for results" : "等待生成结果")}
                </span>
                {!isLoading ? (
                  <button type="button" onClick={() => goToMobileStep(2)} className="focus-ring rounded-md px-2 py-1 text-[11px] font-semibold text-action-strong dark:text-action">
                    {locale === "en" ? "Change settings" : "修改设置"}
                  </button>
                ) : null}
              </div>
              {!canGenerate && generateDisabledReason && !isLoading ? (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{generateDisabledReason}</p>
              ) : null}
            </div>
            {isLoading ? (
              <button type="button" onClick={cancelGeneration} className="focus-ring hidden items-center justify-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:border-red-500/60 hover:bg-red-500/20 lg:inline-flex">
                <Square className="h-3 w-3 fill-current" />
                {locale === "en" ? "Cancel" : "取消生成"}
              </button>
            ) : !entitlement.authenticated ? (
              <Link href="/login" data-testid="generate-login-desktop" className={`${buttonStyles({ variant: "primary", size: "md" })} !hidden lg:!inline-flex`}>
                <LogIn className="h-4 w-4" />
                {locale === "en" ? "Sign in to generate free" : "登录后免费生成"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <button type="button" data-testid="generate-kit-desktop" onClick={() => void generateKit()} disabled={!canGenerate} title={!canGenerate && generateDisabledReason ? generateDisabledReason : undefined} className={`${buttonStyles({ variant: "primary", size: "md" })} !hidden lg:!inline-flex whitespace-nowrap`}>
                <WandSparkles className="h-4 w-4" />
                {copy.generate} <span className="opacity-80">· ~{computeKitCost(selectedPlatforms.length, { images: withImage ? selectedPlatforms.length : 0 })} {locale === "en" ? "Credits" : "点数"}</span> <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
          <OutputBoard
            outputs={outputs}
            isLoading={isLoading}
            isRunActive={generationRun ? isGenerationRunActive(generationRun) : false}
            error={error}
            locale={locale}
            canUseOutputs={entitlement.canUseOutputs}
            canPolish={entitlement.polish}
            platformCount={selectedPlatforms.length}
            expectedPlatforms={selectedPlatforms}
            usedContext={usedContext}
            onLockedAction={(reason) => setGate({ open: true, reason })}
            kitId={persistedKitId ?? undefined}
            growthMissionId={growthMissionId ?? undefined}
            mediaAssets={mediaAssets}
            onReviewMedia={reviewMediaAssets}
            onOutputSaved={onOutputSaved}
            referenceImageUrl={mediaAssets.find((asset) => asset.type === "image" && asset.url)?.url}
          />

          {outputs.length > 0 && !isLoading ? (
            <div className="flex items-start gap-3 rounded-lg border border-hairline bg-surface p-3 lg:hidden">
              <FileStack className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>
                <span className="block text-xs font-semibold text-fg">{locale === "en" ? "Add performance after publishing" : "发布后回填表现数据"}</span>
                <span className="mt-1 block text-[11px] leading-4 text-fg-muted">{locale === "en" ? "Performance lives in the content kit so it never interrupts generation." : "数据入口位于内容包详情，不打断本次生成流程。"}</span>
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {outputs.length > 0 && !isLoading ? (
        <div className={`${mobileStep === 3 ? "block" : "hidden"} lg:block`}>
          <QualityScorePanel outputs={outputs} brain={getBrandBrain()} locale={locale} />
        </div>
      ) : null}

      <div className="hidden lg:block">
        <PerformancePanel kit={currentKit} locale={locale} canAnalyze={entitlement.canAnalyze} onLockedAction={(reason) => setGate({ open: true, reason })} />
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-hairline bg-surface/95 px-3 py-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-xl gap-2">
          {mobileStep === 1 ? (
            <>
              <p className={`text-[11px] font-medium ${sourceReady ? "text-positive" : "text-fg-muted"}`}>{sourceGuidance}</p>
              <button type="button" onClick={() => goToMobileStep(2)} disabled={!sourceReady || isLoading} className={buttonStyles({ variant: "secondary", size: "lg", fullWidth: true })}>
                {locale === "en" ? "Next · Choose platforms" : "下一步 · 选择平台"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : mobileStep === 2 ? (
            <>
              <div className="flex items-center justify-between gap-3 text-[11px] text-fg-muted">
                <span className="whitespace-nowrap">{selectedPlatforms.length} {locale === "en" ? "platforms selected" : "个平台已选"}</span>
                <span className="font-semibold text-brand whitespace-nowrap">~{computeKitCost(selectedPlatforms.length, { images: withImage ? selectedPlatforms.length : 0 })} {locale === "en" ? "Credits" : "点数"}</span>
                <span className="whitespace-nowrap">{locale === "en" ? `~${estimatedSeconds}s` : `约 ${estimatedSeconds} 秒`}</span>
              </div>
              {!entitlement.authenticated ? (
                <Link href="/login" data-testid="generate-login-mobile" className={buttonStyles({ variant: "primary", size: "lg", fullWidth: true })}>
                  <LogIn className="h-4 w-4" />
                  {locale === "en" ? "Sign in to generate free" : "登录后免费生成"}
                </Link>
              ) : (
                <button type="button" data-testid="generate-kit-mobile" onClick={() => void startMobileGeneration()} disabled={!canGenerate} title={!canGenerate && generateDisabledReason ? generateDisabledReason : undefined} className={buttonStyles({ variant: "primary", size: "lg", fullWidth: true })}>
                  <WandSparkles className="h-4 w-4" />
                  {locale === "en" ? `Generate for ${selectedPlatforms.length} platforms` : `生成 ${selectedPlatforms.length} 个平台内容`}
                </button>
              )}
              {!canGenerate && generateDisabledReason ? <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">{generateDisabledReason}</p> : null}
            </>
          ) : isLoading ? (
            <button type="button" onClick={cancelGeneration} className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600 transition dark:text-red-300">
              <Square className="h-3.5 w-3.5 fill-current" />
              {locale === "en" ? "Cancel generation" : "取消生成"}
            </button>
          ) : outputs.length > 0 ? (
            <>
              <Link href={kitHref} className={buttonStyles({ variant: "secondary", size: "lg", fullWidth: true })}>
                <FileStack className="h-4 w-4" />
                {persistedKitId ? (locale === "en" ? "Open content kit" : "打开内容包") : (locale === "en" ? "View content library" : "查看内容库")}
              </Link>
              <p className="text-center text-[10px] text-fg-muted">{locale === "en" ? "Keep switching platforms and editing here — your content stays available." : "可继续切换平台编辑，当前内容不会丢失。"}</p>
            </>
          ) : (
            <button type="button" onClick={() => goToMobileStep(2)} className={buttonStyles({ variant: "tertiary", size: "lg", fullWidth: true })}>
              <ArrowLeft className="h-4 w-4" />
              {locale === "en" ? "Back to platform settings" : "返回平台设置"}
            </button>
          )}
        </div>
      </div>

      <UpgradeGate open={gate.open} locale={locale} reason={gate.reason} authenticated={entitlement.authenticated} onClose={() => setGate((current) => ({ ...current, open: false }))} />
    </div>
  );
}
