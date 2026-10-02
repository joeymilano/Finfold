"use client";

import { addToast } from "@/components/ui/Toast";
import { captureEvent } from "@/lib/posthog";
import { getAcquisitionProperties } from "@/lib/acquisition";
import { currentFirstTaskId } from "@/lib/first-task";
import { getBrandBrain, loadPersistedBrandBrain } from "@/lib/brand-brain";
import { playTaskCompleteSound } from "@/lib/completion-sound";
import { getStoredCustomGuardrails, loadPersistedCustomGuardrails } from "@/lib/guardrails";
import { consumeSSEStream } from "@/lib/sse-client";
import type { ContentKit, KitOutput, MediaAsset } from "@/lib/content-schema";
import type { SourceImageAsset, SourceImageCandidate, VisualMode } from "@/lib/source-image";
import type { AgentAttachment } from "@/lib/agent/attachments";
import type { GoalId } from "@/lib/goals";
import type { PersonaId } from "@/lib/personas";
import { MAX_PLATFORMS_PER_GENERATION, type PlatformId } from "@/lib/platforms";
import { getGenerateDisabledReason } from "@/lib/workbench-gating";
import { getStoredLocale } from "@/lib/theme";
import { type Locale } from "@/lib/i18n";
import {
  clearPendingGeneration,
  isGenerationRunActive,
  isGenerationRunStale,
  loadPendingGeneration,
  savePendingGeneration,
  type PublicGenerationRun
} from "@/lib/generation-run-client";
import { recordGenerationDuration } from "@/lib/generation-eta";
import {
  REFERRAL_ACTIVATED_EVENT,
  REFERRAL_SHARE_PROMPT_EVENT,
  REFERRAL_SHARE_PROMPT_STORAGE_KEY
} from "@/components/referrals/WorkbenchReferralPrompts";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

// How long the client waits for a run before asking the server to
// reconcile it and giving up locally. Shared with canGenerate below so a
// run this old can never permanently block the button — the run banner's
// 取消任务 stays the explicit escape before that, but the button itself
// must not stay disabled forever just because a zombie server row exists.
const RECOVERY_TIMEOUT_MS = 4 * 60 * 1000;

// 新用户进入创作台时默认勾选的平台：跨境创始人最大公约数——
// 小红书（国内社交）+ X（海外短文）+ LinkedIn（海外职场）。
const defaultSelectedPlatforms: PlatformId[] = [
  "xiaohongshu",
  "x",
  "linkedin"
];

export type Allowance = {
  used: number;
  limit: number;
  plan: string;
  /** Hide numeric values while the authoritative Credits read is pending. */
  status?: "ready" | "refreshing" | "unavailable";
  /** Total credits still spendable, including any top-up balance. */
  available?: number;
  /** Credits charged by the most recent generation. */
  costThisRun?: number;
};

/** 本次生成实际注入 prompt 的品牌上下文计数（P0-5：外化"越用越懂你"）。
 * 由 /api/generate 的 done 事件回传，字段取自 buildBrainPromptSection 注入内容。
 * rules 携带实际命中的规则原文，用于溯源展示"为什么这样写"。 */
export type UsedContext = {
  hasBrand: boolean;
  toneKeywords: number;
  bannedPhrases: number;
  approvedExamples: number;
  learnedStyle: number;
  learnedNegative: number;
  performanceRules: number;
  customRules: number;
  perfExamples: number;
  industryPacks: number;
  rules?: {
    learnedStyle: string[];
    learnedNegative: string[];
    performanceRules: string[];
  };
};

export type Entitlement = {
  authenticated: boolean;
  plan: string;
  canUseOutputs: boolean;
  canAnalyze: boolean;
  urlBootstrap: boolean;
  polish: boolean;
  iterateReport: boolean;
  proactiveMonitoring: boolean;
  trialAvailable: boolean;
  monthlyLimit?: number;
  platformLimit?: number;
  used?: number;
  available?: number;
};

function allowanceFromEntitlement(value: Entitlement): Allowance | null {
  const used = value.used;
  const limit = value.monthlyLimit;
  const available = value.available;
  if (
    !Number.isSafeInteger(used) ||
    Number(used) < 0 ||
    !Number.isSafeInteger(limit) ||
    Number(limit) < 0 ||
    !Number.isSafeInteger(available) ||
    Number(available) < 0 ||
    typeof value.plan !== "string" ||
    value.plan.length === 0
  ) {
    return null;
  }
  return {
    used: Number(used),
    limit: Number(limit),
    plan: value.plan,
    available: Number(available),
    status: "ready"
  };
}

function markAllowanceRefreshing(current: Allowance): Allowance {
  return {
    ...current,
    status: "refreshing",
    available: undefined,
    costThisRun: undefined
  };
}

function markAllowanceUnavailable(current: Allowance): Allowance {
  return {
    ...current,
    status: "unavailable",
    available: undefined,
    costThisRun: undefined
  };
}

type WorkbenchContextValue = {
  locale: Locale;
  ideaText: string;
  setIdeaText: (value: string) => void;
  goal: GoalId;
  setGoal: (value: GoalId) => void;
  persona: PersonaId;
  setPersona: (value: PersonaId) => void;
  selectedPlatforms: PlatformId[];
  setSelectedPlatforms: (value: PlatformId[]) => void;
  visualMode: VisualMode;
  setVisualMode: (value: VisualMode) => void;
  visualSource: SourceImageAsset | null;
  setVisualSource: (value: SourceImageAsset | null) => void;
  sourceImageCandidates: SourceImageCandidate[];
  setSourceImageCandidates: (value: SourceImageCandidate[]) => void;
  mediaAssets: MediaAsset[];
  setMediaAssets: (value: MediaAsset[]) => void;
  sourceAttachments: AgentAttachment[];
  setSourceAttachments: (value: AgentAttachment[]) => void;
  outputs: KitOutput[];
  kits: ContentKit[];
  activeKitId: string | null;
  growthMissionId: string | null;
  setGrowthMissionId: (value: string | null) => void;
  researchMissionId: string | null;
  setResearchMissionId: (value: string | null) => void;
  xhsWorkflowId: string | null;
  setXhsWorkflowId: (value: string | null) => void;
  artifactVersionIds: string[];
  setArtifactVersionIds: (value: string[]) => void;
  allowance: Allowance;
  usedContext: UsedContext | null;
  entitlement: Entitlement;
  canvasRestoreComplete: boolean;
  isLoading: boolean;
  isRecoveringGeneration: boolean;
  generationRun: PublicGenerationRun | null;
  error: string | null;
  canGenerate: boolean;
  generateDisabledReason: string | null;
  currentKit: ContentKit | null;
  prepareFreshDraft: () => void;
  removeKit: (kitId: string) => void;
  generateKit: (force?: boolean) => Promise<void>;
  cancelGeneration: () => Promise<void>;
  dismissGenerationRun: () => void;
  onOutputSaved: (platform: string, patch: Partial<KitOutput>) => void;
};

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function useWorkbench(): WorkbenchContextValue {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) throw new Error("useWorkbench must be used within a WorkbenchProvider");
  return ctx;
}

/**
 * 把工作台的核心状态与生成逻辑提升到 app-shell 层（在 layout 包裹），
 * 这样在 dashboard 内切换路由时组件不会卸载——正在进行的生成、画板内容、
 * 输入草稿都得以保留，切回工作台能继续看到进度。
 *
 * 正式创作台只恢复真实 kit 或用户尚未完成的生成。新账号保持真实空状态，
 * 不用示例输出冒充用户数据。visibilitychange / focus 只刷新历史列表，不抢画板。
 */
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  // 必须与 DEFAULT_LOCALE / getStoredLocale() / useLocale 保持一致 ("zh")。
  // 工作台是整个 dashboard 路由组的共享 Provider——若初始值用 "en"，
  // 首屏会先以英文渲染、useEffect 再切回中文，造成整屏英文→中文重绘：
  // 所有含 icon 的区块随之重排，表现为「icon 乱飞 / 两种 UI 闪烁」。
  const [locale, setLocale] = useState<Locale>("zh");
  const [ideaText, setIdeaText] = useState("");
  const [goal, setGoal] = useState<GoalId>("lead-gen");
  const [persona, setPersona] = useState<PersonaId>("ai-saas");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(defaultSelectedPlatforms);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [sourceAttachments, setSourceAttachments] = useState<AgentAttachment[]>([]);
  const [visualMode, setVisualMode] = useState<VisualMode>("source_first");
  const [visualSource, setVisualSource] = useState<SourceImageAsset | null>(null);
  const [sourceImageCandidates, setSourceImageCandidates] = useState<SourceImageCandidate[]>([]);
  const [outputs, setOutputs] = useState<KitOutput[]>([]);
  const [kits, setKits] = useState<ContentKit[]>([]);
  const [activeKitId, setActiveKitId] = useState<string | null>(null);
  const [growthMissionId, setGrowthMissionId] = useState<string | null>(null);
  const [researchMissionId, setResearchMissionId] = useState<string | null>(null);
  const [xhsWorkflowId, setXhsWorkflowId] = useState<string | null>(null);
  const [artifactVersionIds, setArtifactVersionIds] = useState<string[]>([]);
  const [allowance, setAllowance] = useState<Allowance>({
    used: 0,
    limit: 0,
    plan: "free",
    status: "refreshing"
  });
  // 本次生成实际引用的品牌上下文计数（P0-5 胶囊）；生成开始时清空。
  const [usedContext, setUsedContext] = useState<UsedContext | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement>({
    authenticated: false,
    plan: "free",
    canUseOutputs: false,
    canAnalyze: false,
    urlBootstrap: false,
    polish: false,
    iterateReport: false,
    proactiveMonitoring: false,
    trialAvailable: false
  });
  const [canvasRestoreComplete, setCanvasRestoreComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecoveringGeneration, setIsRecoveringGeneration] = useState(false);
  const [generationRun, setGenerationRun] =
    useState<PublicGenerationRun | null>(null);
  // The initial entitlement + kit restore is asynchronous. A fast user can
  // start typing or choose platforms before that request returns; restoring an
  // old kit at that point would silently replace their new work. Only setters
  // exposed to the UI mark the canvas as touched — internal recovery writes do
  // not — so the first restore can safely stand down without disabling genuine
  // generation recovery.
  const canvasTouchedRef = useRef(false);
  const setIdeaTextFromUser = useCallback((value: string) => {
    canvasTouchedRef.current = true;
    setIdeaText(value);
  }, []);
  const setGoalFromUser = useCallback((value: GoalId) => {
    canvasTouchedRef.current = true;
    setGoal(value);
  }, []);
  const setPersonaFromUser = useCallback((value: PersonaId) => {
    canvasTouchedRef.current = true;
    setPersona(value);
  }, []);
  const setSelectedPlatformsFromUser = useCallback((value: PlatformId[]) => {
    canvasTouchedRef.current = true;
    setSelectedPlatforms(value);
  }, []);
  const setVisualModeFromUser = useCallback((value: VisualMode) => {
    canvasTouchedRef.current = true;
    setVisualMode(value);
  }, []);
  const setVisualSourceFromUser = useCallback((value: SourceImageAsset | null) => {
    canvasTouchedRef.current = true;
    setVisualSource(value);
  }, []);
  const setSourceImageCandidatesFromUser = useCallback((value: SourceImageCandidate[]) => {
    canvasTouchedRef.current = true;
    setSourceImageCandidates(value);
  }, []);
  const setMediaAssetsFromUser = useCallback((value: MediaAsset[]) => {
    canvasTouchedRef.current = true;
    setMediaAssets(value);
  }, []);
  const setSourceAttachmentsFromUser = useCallback((value: AgentAttachment[]) => {
    canvasTouchedRef.current = true;
    setSourceAttachments(value);
  }, []);
  // 生成过程的 AbortController：支持用户中途取消生成。
  const abortRef = useRef<AbortController | null>(null);
  const entitlementRequestSequenceRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const refreshEntitlement = useCallback(async (): Promise<Entitlement | null> => {
    const requestSequence = ++entitlementRequestSequenceRef.current;
    const failCurrentRequest = () => {
      if (requestSequence === entitlementRequestSequenceRef.current) {
        setAllowance(markAllowanceUnavailable);
      }
      return null;
    };
    try {
      const response = await fetch("/api/entitlements/check", {
        method: "POST",
        cache: "no-store"
      });
      if (!response.ok) return failCurrentRequest();
      const next = (await response.json()) as Entitlement;
      const nextAllowance = allowanceFromEntitlement(next);
      if (!nextAllowance) return failCurrentRequest();
      if (requestSequence !== entitlementRequestSequenceRef.current) return null;
      setEntitlement(next);
      setAllowance(nextAllowance);
      return next;
    } catch {
      return failCurrentRequest();
    }
  }, []);

  // 同步全局语言切换（LocaleToggle）。
  useEffect(() => {
    if (typeof window !== "undefined") {
      setLocale(getStoredLocale());
    }
    function onLocaleChange(e: Event) {
      setLocale((e as CustomEvent<Locale>).detail);
    }
    window.addEventListener("finfold-locale-change", onLocaleChange);
    return () => window.removeEventListener("finfold-locale-change", onLocaleChange);
  }, []);

  /**
   * 加载权限与 kit 历史。
   * restoreCanvas=true（仅首次 mount）：决定画板初始内容——
   *   有未完成任务 → 恢复输入；有真实 kit → 最新真实 kit；否则保持空状态。
   * restoreCanvas=false（visibilitychange / focus）：只刷新侧边栏列表，不抢画板，
   *   保留用户当前正在看 / 正在编辑的内容。
   */
  const loadKits = useCallback(
    async (restoreCanvas = false) => {
      try {
        const entitlementData = await refreshEntitlement();
        if (!entitlementData) return;

        if (!entitlementData.authenticated) {
          setKits([]);
          if (restoreCanvas) {
            setOutputs([]);
            setActiveKitId(null);
            setGrowthMissionId(null);
            setResearchMissionId(null);
            setXhsWorkflowId(null);
            setArtifactVersionIds([]);
            setSourceAttachments([]);
            setVisualMode("source_first");
            setVisualSource(null);
            setSourceImageCandidates([]);
          }
          return;
        }

        const response = await fetch("/api/kits", { cache: "no-store" });
        const data = (await response.json()) as { kits?: ContentKit[] };
        const realKits = data.kits ?? [];
        setKits(realKits);

        if (restoreCanvas && !canvasTouchedRef.current) {
          const pendingGeneration = loadPendingGeneration();
          if (pendingGeneration?.runId) {
            const pending = pendingGeneration.input;
            setOutputs([]);
            setActiveKitId(null);
            setIdeaText(pending.ideaText);
            setGoal(pending.goal);
            setPersona(pending.persona);
            setSelectedPlatforms(pending.platforms);
            setGrowthMissionId(pending.growthMissionId);
            setResearchMissionId(pending.researchMissionId ?? null);
            setXhsWorkflowId(pending.xhsWorkflowId);
            setArtifactVersionIds(pending.artifactVersionIds);
            setMediaAssets(pending.mediaAssets);
            setSourceAttachments(pending.sourceAttachments ?? []);
            setVisualMode(pending.visualMode ?? "source_first");
            setVisualSource(pending.visualSource ?? null);
            setSourceImageCandidates([]);
          } else if (realKits.length > 0) {
            const latest = realKits[0];
            setOutputs(latest.outputs);
            setActiveKitId(latest.id);
            setGrowthMissionId(latest.growthMissionId ?? null);
            setResearchMissionId(latest.researchMissionId ?? null);
            setXhsWorkflowId(latest.xhsWorkflowId ?? null);
            setArtifactVersionIds(latest.artifactVersionIds ?? []);
            setSourceAttachments([]);
            setVisualMode("source_first");
            setVisualSource(latest.visualSource ?? null);
            setSourceImageCandidates([]);
            if (latest.ideaText) setIdeaText(latest.ideaText);
            if (latest.goal) setGoal(latest.goal);
            if (latest.persona) setPersona(latest.persona);
            if (latest.platforms?.length) setSelectedPlatforms(latest.platforms);
          } else {
            // 新账号只展示真实空状态，等待用户创建第一份内容包。
            setOutputs([]);
            setActiveKitId(null);
            setGrowthMissionId(null);
            setResearchMissionId(null);
            setXhsWorkflowId(null);
            setArtifactVersionIds([]);
            setSourceAttachments([]);
            setVisualMode("source_first");
            setVisualSource(null);
            setSourceImageCandidates([]);
          }
        }
      } catch {
        // 网络失败时静默，保留当前画板状态，不阻塞渲染。
      } finally {
        if (restoreCanvas) setCanvasRestoreComplete(true);
      }
    },
    [refreshEntitlement]
  );

  // 首次挂载：恢复画板（只跑一次，locale 变化不重复恢复，避免覆盖用户编辑）。
  const didRestoreRef = useRef(false);
  useEffect(() => {
    if (didRestoreRef.current) return;
    didRestoreRef.current = true;

    // Clean up stale pending generations on mount (older than 6 hours)
    try {
      const pending = loadPendingGeneration();
      if (pending?.savedAt) {
        const savedTime = Date.parse(pending.savedAt);
        const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
        if (Number.isFinite(savedTime) && savedTime < sixHoursAgo) {
          console.warn("[Workbench] Clearing stale pending generation from localStorage", {
            savedAt: pending.savedAt,
            runId: pending.runId
          });
          clearPendingGeneration();
        }
      }
    } catch (err) {
      console.error("[Workbench] Failed to clean up stale pending generation:", err);
    }

    void loadKits(true);
  }, [loadKits]);

  // 回到前台 / 窗口聚焦：只刷新侧边栏历史，不动画板。
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadKits(false);
      }
    }
    function onWindowFocus() {
      void loadKits(false);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [loadKits]);

  // Resume a generation that outlived the browser page. The server run is
  // authoritative; localStorage only remembers which owner-scoped run to
  // query and restores the user's draft controls for a safe retry. Keep the
  // recovery loop active during the foreground SSE request too: a provider or
  // network stream can hang after the durable run has already finished.
  useEffect(() => {
    if (!entitlement.authenticated) return;
    const pending = loadPendingGeneration();
    const pendingRunId = pending?.runId ?? generationRun?.id;
    if (!pendingRunId) return;
    const recoveryRunId = pendingRunId;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveRecoveryAttempts = 0;
    const MAX_RECOVERY_ATTEMPTS = 3;
    // Client-side hard timeout based on the GENERATION START, not effect-mount
    // time — so it survives page refreshes (a refresh re-mounts this effect and
    // would otherwise reset the cap, letting a stuck run spin forever as long as
    // the user keeps refreshing). Seed from the persisted client start; once the
    // server run is fetched we prefer its authoritative startedAt/createdAt
    // (Math.min keeps the earliest, so the cap fires on the true generation
    // start regardless of localStorage integrity). A stalled worker can keep its
    // heartbeat fresh while never finishing (e.g. an LLM call hanging).
    let runStartedAt = pending?.savedAt
      ? Date.parse(pending.savedAt)
      : Date.now();

    async function requestRecovery(runId: string): Promise<"recovered" | "still_active" | "failed"> {
      setIsRecoveringGeneration(true);
      try {
        const recovery = await fetch(
          `/api/generation-runs/${encodeURIComponent(runId)}/recover`,
          { method: "POST" }
        );
        // 409 means recover_stale_generation_run found the run still
        // legitimately active (fresh lease/heartbeat) — that is not a
        // broken endpoint, it is the expected answer while work is in
        // flight, so it must not be reported as a failure.
        if (recovery.status === 409) return "still_active";
        return recovery.ok ? "recovered" : "failed";
      } finally {
        setIsRecoveringGeneration(false);
      }
    }

    async function pollRun() {
      if (cancelled) return;
      if (Date.now() - runStartedAt > RECOVERY_TIMEOUT_MS) {
        // Ask the server to reconcile before giving up locally — otherwise
        // the run stays "running" server-side and a reload re-adopts the
        // same stuck run.
        await requestRecovery(recoveryRunId).catch(() => "failed" as const);
        clearPendingGeneration();
        setGenerationRun(null);
        setIsLoading(false);
        setError(
          locale === "en"
            ? "Generation is taking much longer than expected and may have stalled. Please try again."
            : "生成时间远超预期，可能已卡住，请重新生成。"
        );
        return;
      }
      try {
        const response = await fetch(
          `/api/generation-runs/${encodeURIComponent(recoveryRunId)}`,
          { cache: "no-store" }
        );
        if (response.status === 404) {
          clearPendingGeneration();
          setGenerationRun(null);
          setIsLoading(false);
          return;
        }
        const data = (await response.json()) as {
          run?: PublicGenerationRun;
          error?: string;
        };
        if (!response.ok || !data.run) {
          throw new Error(data.error ?? "Failed to recover generation.");
        }

        const run = data.run;
        if (cancelled) return;
        // Refine the timeout anchor to the server's authoritative run start.
        const serverStart = Date.parse(run.startedAt ?? run.createdAt);
        if (Number.isFinite(serverStart)) {
          runStartedAt = Math.min(runStartedAt, serverStart);
        }
        setGenerationRun(run);

        if (isGenerationRunActive(run)) {
          if (isGenerationRunStale(run)) {
            // Limit recovery attempts to prevent infinite loops
            if (consecutiveRecoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
              clearPendingGeneration();
              setGenerationRun(null);
              setIsLoading(false);
              setError(
                locale === "en"
                  ? "Generation recovery failed after multiple attempts. Please try generating again."
                  : "生成恢复多次尝试后失败，请重新生成。"
              );
              return;
            }
            consecutiveRecoveryAttempts++;
            const recoveryOutcome = await requestRecovery(run.id);
            if (recoveryOutcome === "recovered") {
              pollTimer = setTimeout(() => void pollRun(), 250);
              return;
            }
            if (recoveryOutcome === "still_active") {
              // Not stale after all — the server disagrees with our
              // heartbeat read. Fall back to the normal poll cadence
              // instead of treating this as an endpoint failure.
              consecutiveRecoveryAttempts = 0;
              pollTimer = setTimeout(() => void pollRun(), 1200);
              return;
            }
            clearPendingGeneration();
            setGenerationRun(null);
            setIsLoading(false);
            setError(
              locale === "en"
                ? "Generation recovery endpoint failed. Please try generating again."
                : "生成恢复接口失败，请重新生成。"
            );
            return;
          }
          // Reset consecutive attempts if run is active but not stale.
          // This is routine polling of an in-flight run, not "recovery" —
          // isRecoveringGeneration must stay false so the disabled-reason
          // text holds one steady message instead of oscillating every tick.
          consecutiveRecoveryAttempts = 0;
          pollTimer = setTimeout(() => void pollRun(), 1200);
          return;
        }

        // Run is no longer active, reset recovery flag
        consecutiveRecoveryAttempts = 0;
        if (
          (run.status === "succeeded" || run.status === "partial_success") &&
          run.contentKitId
        ) {
          const kitResponse = await fetch(
            `/api/kits/${encodeURIComponent(run.contentKitId)}`,
            { cache: "no-store" }
          );
          const kitData = (await kitResponse.json()) as {
            kit?: ContentKit;
            error?: string;
          };
          if (!kitResponse.ok || !kitData.kit) {
            throw new Error(
              kitData.error ?? "Generated kit could not be restored."
            );
          }
          if (cancelled) return;
          const kit = kitData.kit;
          captureEvent("generation_result_restored", {
            generationRunId: run.id, kit_id: kit.id, delivery: "recovery", analytics_version: 2
          });
          setOutputs(kit.outputs);
          setActiveKitId(kit.id);
          setVisualMode("source_first");
          setVisualSource(kit.visualSource ?? null);
          setSourceImageCandidates([]);
          setGrowthMissionId(kit.growthMissionId ?? null);
          setResearchMissionId(
            kit.researchMissionId ?? loadPendingGeneration()?.input.researchMissionId ?? null
          );
          setXhsWorkflowId(kit.xhsWorkflowId ?? null);
          setArtifactVersionIds(kit.artifactVersionIds ?? []);
          setKits((current) => [
            kit,
            ...current.filter((item) => item.id !== kit.id)
          ]);
          // 记录 durable queue 运行的真实耗时，供 ETA 基于历史数据预估。
          recordGenerationDuration(
            kit.platforms.length,
            Date.now() - runStartedAt
          );
          clearPendingGeneration();
          setGenerationRun(null);
          setIsLoading(false);
          abortRef.current?.abort();
          addToast(
            "success",
            run.status === "partial_success"
              ? locale === "en"
                ? "Generation completed with partial results; completed drafts were restored."
                : "生成已部分完成，成功的草稿已恢复。"
              : locale === "en"
                ? "Your completed generation was restored."
                : "已恢复刚刚完成的内容生成。"
          );
          playTaskCompleteSound();
          setAllowance(markAllowanceRefreshing);
          await refreshEntitlement();
          return;
        }

        const fallback =
          locale === "en"
            ? "The previous generation was interrupted. You can retry safely."
            : "上一次生成已中断，可以安全重试。";
        setError(run.error?.message ?? fallback);
        setIsLoading(false);
        if (!run.error?.retryable) {
          clearPendingGeneration();
        }
        abortRef.current?.abort();
        setAllowance(markAllowanceRefreshing);
        await refreshEntitlement();
      } catch {
        if (cancelled) return;
        setIsRecoveringGeneration(false);
        pollTimer = setTimeout(() => void pollRun(), 1500);
      }
    }

    void pollRun();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [entitlement.authenticated, generationRun?.id, locale, refreshEntitlement]);

  const generateKit = useCallback(async (force = false) => {
    setError(null);
    if (!entitlement.authenticated || allowance.status !== "ready") {
      const message = allowance.status === "unavailable"
        ? locale === "en"
          ? "Your AI Credits are temporarily unavailable. Refresh the page or try again shortly."
          : "创作点数暂时不可用，请刷新页面或稍后重试。"
        : !entitlement.authenticated
          ? locale === "en"
            ? "Sign in with a free account before generating content."
            : "请先登录免费账户，再生成内容。"
          : allowance.status !== "ready"
          ? locale === "en"
            ? "Your session and AI Credits must finish loading before generation can start."
            : "会话与创作点数尚未加载完成，请稍候再生成。"
          : locale === "en"
            ? "Generation is temporarily unavailable."
            : "当前暂时无法生成。";
      setError(message);
      addToast("error", message);
      return;
    }
    setIsLoading(true);
    const generationStartedAt = Date.now();
    const generationRequestId = crypto.randomUUID();
    let generationRunId: string | null = null;
    // Set true only on the queued early-return path below. isLoading must
    // stay true across that return — the recovery-poll effect owns the
    // progress display for a queued run — so `finally` must not reset it
    // there. Every other exit (success, error, abort) still clears it.
    let keepLoadingForQueuedRun = false;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let customGuardrails = getStoredCustomGuardrails();
      if (entitlement.authenticated) {
        try {
          const persisted = await loadPersistedCustomGuardrails();
          customGuardrails = persisted.rules;
        } catch {
          // 保留本地兜底
        }
      }
      const customRules = customGuardrails.map((r) => `${r.title}: ${r.detail}`);

      let brandBrain = getBrandBrain();
      if (entitlement.authenticated) {
        try {
          const persisted = await loadPersistedBrandBrain();
          brandBrain = persisted.brain;
        } catch {
          // 保留本地兜底
        }
      }

      const isFirstKit = entitlement.authenticated && kits.length === 0;
      const pendingSnapshot = {
        requestId: generationRequestId,
        runId: null,
        savedAt: new Date().toISOString(),
        input: {
          ideaText,
          goal,
          persona,
          platforms: selectedPlatforms,
          growthMissionId,
          researchMissionId,
          xhsWorkflowId,
          artifactVersionIds,
          mediaAssets,
          sourceAttachments,
          visualMode,
          visualSource,
          locale
        }
      } satisfies Parameters<typeof savePendingGeneration>[0];
      setGenerationRun(null);
      savePendingGeneration(pendingSnapshot);
      const firstTaskId = currentFirstTaskId();
      const analytics = {
        traffic_class: getAcquisitionProperties().traffic_class === "qa" ? "qa" : "production",
        entry_point: firstTaskId ? "first_task" : "workbench",
        ...(firstTaskId ? { first_task_id: firstTaskId } : {})
      };
      captureEvent("kit_generation_started", {
        ...analytics,
        analytics_version: 2,
        generationRequestId,
        authenticated: entitlement.authenticated,
        plan: entitlement.plan,
        firstKit: isFirstKit,
        platformCount: selectedPlatforms.length,
        hasMedia: mediaAssets.length > 0,
        hasResearchIntelligence: Boolean(researchMissionId),
        sourceLengthBucket: ideaText.length < 200 ? "short" : ideaText.length < 1000 ? "medium" : "long"
      });
      // 清空画板，让流式输出逐条渲染，而不是叠在旧 kit 上。
      setOutputs([]);
      setUsedContext(null);

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": generationRequestId,
          ...(force ? { "x-finfold-force-regenerate": "1" } : {})
        },
        signal: controller.signal,
        body: JSON.stringify({
          analytics,
          ideaText,
          goal,
          persona,
          platforms: selectedPlatforms,
          visualMode,
          visualSource: visualMode === "source_first" ? visualSource ?? undefined : undefined,
          growthMissionId: growthMissionId ?? undefined,
          researchMissionId: researchMissionId ?? undefined,
          xhsWorkflowId: xhsWorkflowId ?? undefined,
          artifactVersionIds: artifactVersionIds.length === 0 ? undefined : artifactVersionIds,
          mediaAssets,
          sourceAttachments,
          // Product chrome stays zh/en, while output language follows the
          // user's source brief (or an explicit language request inside it).
          language: "auto",
          customRules,
          brandBrain: brandBrain.brandName || brandBrain.productDescription ? brandBrain : undefined
        })
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Growth asset package could not be generated.");
      }

      let finishedKit: ContentKit | null = null;
      let finishedAllowance: Allowance | undefined;
      let finishedUsedContext: UsedContext | null = null;
      let streamError: string | null = null;
      let queuedAccepted = false;
      // Wrapped in an object so TS control-flow analysis doesn't narrow the
      // closed-over flag back to its `null` initializer at the read site
      // (which would type the `if (duplicate.hit)` body as `never`). Object
      // property reads keep the declared type. Same trap as the closed-over
      // finishedKit/streamError flags, but those are read in a way that's
      // compatible with being narrowed; the duplicate payload is not.
      const duplicate: {
        hit: {
          contentKitId: string;
          createdAt: string;
          persona: string;
          platforms: string[];
        } | null;
      } = { hit: null };

      await consumeSSEStream(response, (event, data) => {
        if (event === "run") {
          const payload = data as { run?: PublicGenerationRun };
          generationRunId = payload.run?.id ?? null;
          if (payload.run?.id) {
            setGenerationRun(payload.run);
            savePendingGeneration({
              ...pendingSnapshot,
              runId: payload.run.id
            });
          }
        } else if (event === "queued") {
          queuedAccepted = true;
        } else if (event === "output") {
          const { output } = data as { output: KitOutput };
          setOutputs((current) => [...current.filter((o) => o.platform !== output.platform), output]);
        } else if (event === "image") {
          const { platform, imageUrl, imageSource } = data as {
            platform: string;
            imageUrl: string;
            imageSource?: KitOutput["imageSource"];
          };
          setOutputs((current) =>
            current.map((o) => (o.platform === platform ? { ...o, imageUrl, imageSource } : o))
          );
        } else if (event === "done") {
          const payload = data as {
            kit: ContentKit;
            allowance?: Allowance;
            entitlement?: Entitlement;
            usedContext?: UsedContext;
            referralReward?: { granted: boolean; credits: number; expiresAt: string | null } | null;
          };
          finishedKit = payload.kit;
          finishedAllowance = payload.allowance;
          finishedUsedContext = payload.usedContext ?? null;
          if (payload.referralReward?.granted) {
            addToast(
              "success",
              locale === "en"
                ? `${payload.referralReward.credits} referral Credits unlocked!`
                : `邀请奖励已解锁：${payload.referralReward.credits} 创作点数到账！`
            );
            captureEvent("referral_reward_seen", {
              credits: payload.referralReward.credits,
              role: "referred"
            });
            window.dispatchEvent(new Event(REFERRAL_ACTIVATED_EVENT));
          }
        } else if (event === "duplicate") {
          duplicate.hit = data as {
            contentKitId: string;
            createdAt: string;
            persona: string;
            platforms: string[];
          };
        } else if (event === "error") {
          streamError = (data as { error?: string }).error ?? "Growth asset package could not be generated.";
        }
      });

      if (duplicate.hit) {
        const dh = duplicate.hit;
        const ageDays = Math.floor(
          (Date.now() - new Date(dh.createdAt).getTime()) / 86_400_000
        );
        const ageLabel =
          locale === "en"
            ? ageDays < 1
              ? "earlier today"
              : ageDays === 1
                ? "yesterday"
                : `${ageDays} days ago`
            : ageDays < 1
              ? "今天早些时候"
              : ageDays === 1
                ? "昨天"
                : `${ageDays} 天前`;
        captureEvent("kit_generation_duplicate_shown", {
          existingKitId: dh.contentKitId,
          ageDays
        });
        addToast(
          "warning",
          locale === "en"
            ? `You generated this exact combo ${ageLabel}. Open the saved result instead of regenerating?`
            : `这个组合${ageLabel}已生成过，要直接打开历史结果吗？（重新生成会消耗点数）`,
          9000,
          {
            label: locale === "en" ? "Open history" : "打开历史",
            onClick: () => {
              const existing = kits.find((k) => k.id === dh.contentKitId);
              if (existing) {
                setIdeaText(existing.ideaText);
                setGoal(existing.goal);
                setPersona(existing.persona);
                setSelectedPlatforms(existing.platforms);
                setOutputs(existing.outputs);
                setActiveKitId(existing.id);
                setGrowthMissionId(existing.growthMissionId ?? null);
                setResearchMissionId(existing.researchMissionId ?? null);
                setXhsWorkflowId(existing.xhsWorkflowId ?? null);
                setArtifactVersionIds(existing.artifactVersionIds ?? []);
                setSourceAttachments([]);
                setVisualMode("source_first");
                setVisualSource(existing.visualSource ?? null);
                setSourceImageCandidates([]);
                addToast("info", locale === "en" ? "Opened your previous kit." : "已打开历史内容。");
              } else {
                addToast("info", locale === "en" ? "It's saved in your content library." : "已保存在内容库中。");
              }
            }
          },
          {
            label: locale === "en" ? "Regenerate" : "重新生成",
            onClick: () => { void generateKit(true); }
          }
        );
        setAllowance(markAllowanceRefreshing);
        await refreshEntitlement();
        return;
      }

      if (queuedAccepted && generationRunId && !streamError) {
        captureEvent("kit_generation_queued", {
          plan: entitlement.plan,
          platformCount: selectedPlatforms.length,
          generationRunId
        });
        setAllowance(markAllowanceRefreshing);
        await refreshEntitlement();
        // For queued generations, keep isLoading=true and let the recovery
        // polling effect handle the progress display — the generation
        // continues in the background queue worker.
        keepLoadingForQueuedRun = true;
        return;
      }

      if (streamError || !finishedKit) {
        throw new Error(streamError ?? "Growth asset package could not be generated.");
      }

      const kit: ContentKit = finishedKit;
      clearPendingGeneration();
      setGenerationRun(null);
      setOutputs(kit.outputs);
      setUsedContext(finishedUsedContext);
      // Partial-success guard. generateViaLetta/generateViaLLM only return the
      // platforms that actually generated — failed/retry-exhausted ones are
      // skipped (lib/llm.ts returns platforms.filter(collected.has)). Without
      // this check we'd toast "内容已生成！" for a 4-platform request that only
      // produced 1 card, leaving the user wondering where the other 3 went.
      const requestedPlatformCount = kit.platforms.length;
      const isPartialKit = kit.outputs.length < requestedPlatformCount;
      addToast(
        isPartialKit ? "warning" : "success",
        isPartialKit
          ? locale === "en"
            ? `Generated ${kit.outputs.length} of ${requestedPlatformCount} platforms. Regenerate the missing ones from each card.`
            : `仅成功 ${kit.outputs.length}/${requestedPlatformCount} 个平台，未完成的可在对应卡片单独「重新生成」。`
          : locale === "en"
            ? "Growth kit generated!"
            : "内容已生成！"
      );
      playTaskCompleteSound();
      if (isFirstKit) {
        // First successful task is derived from persisted completion events.
        if (window.localStorage.getItem(REFERRAL_SHARE_PROMPT_STORAGE_KEY) !== "dismissed") {
          window.localStorage.setItem(REFERRAL_SHARE_PROMPT_STORAGE_KEY, "visible");
          window.dispatchEvent(new Event(REFERRAL_SHARE_PROMPT_EVENT));
        }
      }
      setActiveKitId(kit.id);
      setGrowthMissionId(kit.growthMissionId ?? growthMissionId);
      setResearchMissionId(kit.researchMissionId ?? researchMissionId);
      setXhsWorkflowId(kit.xhsWorkflowId ?? xhsWorkflowId);
      setArtifactVersionIds(kit.artifactVersionIds ?? artifactVersionIds);
      setVisualMode("source_first");
      setVisualSource(kit.visualSource ?? visualSource);
      setSourceImageCandidates([]);
      setKits((current) => [kit, ...current.filter((k) => k.id !== kit.id)]);
      // 记录本次真实耗时，供 OutputBoard 的 ETA 基于历史数据预估（替换写死公式）。
      recordGenerationDuration(
        selectedPlatforms.length,
        Date.now() - generationStartedAt
      );
      captureEvent("generation_result_restored", {
        generationRunId, kit_id: kit.id, delivery: "stream", analytics_version: 2
      });
      if (finishedAllowance) {
        setAllowance({ ...finishedAllowance, status: "ready" });
      } else {
        setAllowance(markAllowanceRefreshing);
        await refreshEntitlement();
      }
    } catch (caught) {
      // 用户主动取消生成：静默处理，保留已流式生成的部分内容。
      const aborted = (caught instanceof Error && caught.name === "AbortError") || controller.signal.aborted;
      if (aborted) {
        captureEvent("generation_client_interrupted", {
          platformCount: selectedPlatforms.length,
          durationMs: Date.now() - generationStartedAt,
          generationRequestId,
          generationRunId
        });
      } else {
        const message = caught instanceof Error ? caught.message : "Growth asset package could not be generated.";
        captureEvent("generation_client_error", {
          authenticated: entitlement.authenticated,
          plan: entitlement.plan,
          platformCount: selectedPlatforms.length,
          durationMs: Date.now() - generationStartedAt,
          errorType: caught instanceof Error ? caught.name : "unknown",
          generationRequestId,
          generationRunId
        });
        setError(message);
        addToast("error", message);
      }
    } finally {
      if (!keepLoadingForQueuedRun) {
        setIsLoading(false);
      }
      abortRef.current = null;
    }
  }, [entitlement, allowance.status, kits, ideaText, goal, persona, selectedPlatforms, visualMode, visualSource, growthMissionId, researchMissionId, xhsWorkflowId, artifactVersionIds, mediaAssets, sourceAttachments, locale, refreshEntitlement]);

  /** Durable authenticated runs are cancelled through the owner-scoped
   * server state machine and refunded once. */
  const cancelGeneration = useCallback(async () => {
    abortRef.current?.abort();
    const runId = generationRun?.id ?? loadPendingGeneration()?.runId;
    if (!runId || !entitlement.authenticated) return;
    try {
      const response = await fetch(
        `/api/generation-runs/${encodeURIComponent(runId)}`,
        { method: "DELETE" }
      );
      const data = (await response.json()) as {
        run?: PublicGenerationRun;
        error?: string;
      };
      if (!response.ok || !data.run) {
        throw new Error(data.error ?? "Generation could not be cancelled.");
      }
      setGenerationRun(data.run);
      clearPendingGeneration();
      addToast(
        "success",
        locale === "en"
          ? "Generation cancelled. Reserved Credits were safely reconciled."
          : "生成已取消，预留的创作点数已安全核对。"
      );
      setAllowance(markAllowanceRefreshing);
      await refreshEntitlement();
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Generation could not be cancelled.";
      setError(message);
      addToast("error", message);
    }
  }, [entitlement.authenticated, generationRun?.id, locale, refreshEntitlement]);

  const dismissGenerationRun = useCallback(() => {
    clearPendingGeneration();
    setGenerationRun(null);
    setIsRecoveringGeneration(false);
  }, []);

  const onOutputSaved = useCallback(
    (platform: string, patch: Partial<KitOutput>) => {
      setOutputs((current) => current.map((o) => (o.platform === platform ? { ...o, ...patch } : o)));
      setKits((current) =>
        current.map((kit) =>
          kit.id === activeKitId
            ? { ...kit, outputs: kit.outputs.map((o) => (o.platform === platform ? { ...o, ...patch } : o)) }
            : kit
        )
      );
    },
    [activeKitId]
  );

  /** Detaches the canvas from the previously opened kit before an explicit
   * Agent/operations handoff. Saved kits remain in Content Library. */
  const prepareFreshDraft = useCallback(() => {
    canvasTouchedRef.current = true;
    setOutputs([]);
    setActiveKitId(null);
    setUsedContext(null);
    setError(null);
    setGrowthMissionId(null);
    setResearchMissionId(null);
    setXhsWorkflowId(null);
    setArtifactVersionIds([]);
    setMediaAssets([]);
    setSourceAttachments([]);
    setVisualMode("source_first");
    setVisualSource(null);
    setSourceImageCandidates([]);
  }, []);

  const platformLimit = entitlement.platformLimit;
  // A run past the client recovery timeout must not block generate forever
  // — the poll effect above already asked the server to reconcile it by
  // this point (see requestRecovery in the RECOVERY_TIMEOUT_MS branch), and
  // 取消任务 in the run banner remains the explicit escape before that. If
  // the server row is still genuinely active, generateKit's own idempotent
  // enqueue path (see createQueuedGenerationRun) prevents a duplicate run.
  const isGenerationRunTooOldToBlock = (run: PublicGenerationRun): boolean => {
    const startedAt = Date.parse(run.startedAt ?? run.createdAt);
    return Number.isFinite(startedAt) && Date.now() - startedAt > RECOVERY_TIMEOUT_MS;
  };
  const hasActiveGeneration =
    generationRun !== null &&
    isGenerationRunActive(generationRun) &&
    !isGenerationRunTooOldToBlock(generationRun);
  const canGenerate =
    entitlement.authenticated &&
    allowance.status === "ready" &&
    (ideaText.trim().length >= 20 || sourceAttachments.length > 0) &&
    selectedPlatforms.length > 0 &&
    selectedPlatforms.length <= MAX_PLATFORMS_PER_GENERATION &&
    !isLoading &&
    !hasActiveGeneration &&
    (typeof platformLimit !== "number" || selectedPlatforms.length <= platformLimit);
  const generateDisabledReason = !entitlement.authenticated
    ? locale === "en"
      ? "Preview is open to everyone. Sign in with a free account to generate content."
      : "所有人都可以预览创作台；生成内容前，请先登录免费账户。"
    : allowance.status !== "ready"
    ? allowance.status === "unavailable"
      ? locale === "en"
        ? "AI Credits are temporarily unavailable. Refresh the page or try again shortly."
        : "创作点数暂时不可用，请刷新页面或稍后重试。"
      : locale === "en"
        ? "Checking your session and AI Credits before generation."
        : "正在核对会话与创作点数，完成后才能生成。"
    : hasActiveGeneration
    ? isRecoveringGeneration
      ? locale === "en"
        ? "Recovering previous generation task, please wait..."
        : "正在恢复上一个生成任务，请稍候..."
      : locale === "en"
        ? "A generation task is still running. Please wait for it to complete or cancel it."
        : "有生成任务正在进行中，请等待完成或取消该任务。"
    : getGenerateDisabledReason({
        ideaText,
        sourceAttachmentCount: sourceAttachments.length,
        selectedPlatformCount: selectedPlatforms.length,
        isLoading,
        authenticated: entitlement.authenticated,
        trialUsed: false,
        locale,
        platformLimit,
        maxPlatformsPerGeneration: MAX_PLATFORMS_PER_GENERATION
      });

  const currentKit: ContentKit | null = useMemo(
    () =>
      outputs.length > 0
        ? {
            id: activeKitId ?? "draft-package",
            growthMissionId: growthMissionId ?? undefined,
            researchMissionId: researchMissionId ?? undefined,
            xhsWorkflowId: xhsWorkflowId ?? undefined,
            artifactVersionIds,
            ideaText,
            goal,
            persona,
            platforms: selectedPlatforms,
            mediaAssets,
            visualSource: visualMode === "source_first" ? visualSource ?? undefined : undefined,
            outputs,
            status: outputs.some((output) => output.locked) ? "preview" : "saved",
            createdAt: new Date().toISOString()
          }
        : activeKitId
          ? kits.find((kit) => kit.id === activeKitId) ?? null
          : null,
    [outputs, activeKitId, growthMissionId, researchMissionId, xhsWorkflowId, artifactVersionIds, ideaText, goal, persona, selectedPlatforms, mediaAssets, visualMode, visualSource, kits]
  );

  const removeKit = useCallback((kitId: string) => {
    setKits((current) => current.filter((kit) => kit.id !== kitId));
    if (activeKitId === kitId) {
      setActiveKitId(null);
      setGrowthMissionId(null);
      setResearchMissionId(null);
      setXhsWorkflowId(null);
      setArtifactVersionIds([]);
      setOutputs([]);
      setVisualMode("source_first");
      setVisualSource(null);
      setSourceImageCandidates([]);
    }
  }, [activeKitId]);

  const value: WorkbenchContextValue = {
    locale,
    ideaText,
    setIdeaText: setIdeaTextFromUser,
    goal,
    setGoal: setGoalFromUser,
    persona,
    setPersona: setPersonaFromUser,
    selectedPlatforms,
    setSelectedPlatforms: setSelectedPlatformsFromUser,
    visualMode,
    setVisualMode: setVisualModeFromUser,
    visualSource,
    setVisualSource: setVisualSourceFromUser,
    sourceImageCandidates,
    setSourceImageCandidates: setSourceImageCandidatesFromUser,
    mediaAssets,
    setMediaAssets: setMediaAssetsFromUser,
    sourceAttachments,
    setSourceAttachments: setSourceAttachmentsFromUser,
    outputs,
    kits,
    activeKitId,
    growthMissionId,
    setGrowthMissionId,
    researchMissionId,
    setResearchMissionId,
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
    prepareFreshDraft,
    removeKit,
    generateKit,
    cancelGeneration,
    dismissGenerationRun,
    onOutputSaved
  };

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}
