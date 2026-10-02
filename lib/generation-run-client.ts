import type { MediaAsset } from "@/lib/content-schema";
import type { AgentAttachment } from "@/lib/agent/attachments";
import type { GoalId } from "@/lib/goals";
import type { Locale } from "@/lib/i18n";
import type { PersonaId } from "@/lib/personas";
import type { PlatformId } from "@/lib/platforms";
import type { SourceImageAsset, VisualMode } from "@/lib/source-image";

export const ACTIVE_GENERATION_STORAGE_KEY =
  "finfold-active-generation-v1";

export type PublicGenerationRun = {
  id: string;
  requestId: string;
  traceId: string;
  status:
    | "queued"
    | "running"
    | "partial_success"
    | "succeeded"
    | "failed"
    | "cancelled";
  currentStep:
    | "validate_request"
    | "reserve_credits"
    | "moderate_input"
    | "load_context"
    | "generate_outputs"
    | "persist_kit"
    | "finalize";
  attemptCount: number;
  platformCount: number;
  modelTier: "haiku" | "sonnet" | "opus" | null;
  creditCost: number;
  creditsReserved: boolean;
  creditsRefunded: boolean;
  contentKitId: string | null;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
  startedAt: string | null;
  completedAt: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PendingGenerationSnapshot = {
  requestId: string;
  runId: string | null;
  savedAt: string;
  input: {
    ideaText: string;
    goal: GoalId;
    persona: PersonaId;
    platforms: PlatformId[];
    growthMissionId: string | null;
    researchMissionId?: string | null;
    xhsWorkflowId: string | null;
    artifactVersionIds: string[];
    mediaAssets: MediaAsset[];
    sourceAttachments?: AgentAttachment[];
    visualMode?: VisualMode;
    visualSource?: SourceImageAsset | null;
    locale: Locale;
  };
};

export function savePendingGeneration(
  snapshot: PendingGenerationSnapshot
): void {
  try {
    window.localStorage.setItem(
      ACTIVE_GENERATION_STORAGE_KEY,
      JSON.stringify(snapshot)
    );
  } catch {
    // Recovery is additive. Storage-denied browsers keep the foreground SSE
    // behavior without failing generation.
  }
}

export function loadPendingGeneration(): PendingGenerationSnapshot | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_GENERATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingGenerationSnapshot>;
    if (
      typeof parsed.requestId !== "string" ||
      (parsed.runId !== null && typeof parsed.runId !== "string") ||
      typeof parsed.savedAt !== "string" ||
      !parsed.input ||
      typeof parsed.input.ideaText !== "string" ||
      !Array.isArray(parsed.input.platforms)
    ) {
      clearPendingGeneration();
      return null;
    }
    return parsed as PendingGenerationSnapshot;
  } catch {
    clearPendingGeneration();
    return null;
  }
}

export function clearPendingGeneration(): void {
  try {
    window.localStorage.removeItem(ACTIVE_GENERATION_STORAGE_KEY);
  } catch {
    // Nothing else should fail because browser storage is unavailable.
  }
}

export function isGenerationRunActive(run: PublicGenerationRun): boolean {
  return run.status === "queued" || run.status === "running";
}

export function isGenerationRunStale(
  run: PublicGenerationRun,
  nowMs = Date.now()
): boolean {
  if (!isGenerationRunActive(run)) return false;
  const heartbeat = Date.parse(
    run.lastHeartbeatAt ?? run.startedAt ?? run.createdAt
  );
  return Number.isFinite(heartbeat) && nowMs - heartbeat >= 5 * 60 * 1000;
}

export function generationRunStepLabel(
  step: PublicGenerationRun["currentStep"],
  locale: Locale
): string {
  const labels = {
    validate_request: ["Validating request", "校验生成请求"],
    reserve_credits: ["Securing AI Credits", "锁定本次创作点数"],
    moderate_input: ["Checking content safety", "检查内容安全"],
    load_context: ["Loading Brand Memory", "读取品牌记忆"],
    generate_outputs: ["Generating platform drafts", "生成各平台内容"],
    persist_kit: ["Saving your content kit", "保存内容包"],
    finalize: ["Finalizing", "完成最后处理"]
  } satisfies Record<
    PublicGenerationRun["currentStep"],
    readonly [string, string]
  >;
  return labels[step][locale === "en" ? 0 : 1];
}
