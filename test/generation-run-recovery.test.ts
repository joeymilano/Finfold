import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTIVE_GENERATION_STORAGE_KEY,
  clearPendingGeneration,
  generationRunStepLabel,
  isGenerationRunActive,
  isGenerationRunStale,
  loadPendingGeneration,
  savePendingGeneration,
  type PublicGenerationRun
} from "@/lib/generation-run-client";

function run(
  patch: Partial<PublicGenerationRun> = {}
): PublicGenerationRun {
  return {
    id: "run-123",
    requestId: "request-123",
    traceId: "trace-123",
    status: "running",
    currentStep: "generate_outputs",
    attemptCount: 1,
    platformCount: 3,
    modelTier: "haiku",
    creditCost: 130,
    creditsReserved: true,
    creditsRefunded: false,
    contentKitId: null,
    error: null,
    startedAt: "2026-07-29T10:00:00.000Z",
    completedAt: null,
    lastHeartbeatAt: "2026-07-29T10:01:00.000Z",
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:01:00.000Z",
    ...patch
  };
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    value: new MemoryStorage(),
    configurable: true
  });
});

describe("generation run recovery", () => {
  it("only treats queued and running runs as active", () => {
    expect(isGenerationRunActive(run())).toBe(true);
    expect(isGenerationRunActive(run({ status: "queued" }))).toBe(true);
    expect(isGenerationRunActive(run({ status: "failed" }))).toBe(false);
    expect(isGenerationRunActive(run({ status: "succeeded" }))).toBe(false);
    expect(isGenerationRunActive(run({ status: "partial_success" }))).toBe(false);
  });

  it("waits five minutes after the latest heartbeat before recovery", () => {
    const current = run();
    expect(
      isGenerationRunStale(
        current,
        Date.parse("2026-07-29T10:05:59.999Z")
      )
    ).toBe(false);
    expect(
      isGenerationRunStale(
        current,
        Date.parse("2026-07-29T10:06:00.000Z")
      )
    ).toBe(true);
  });

  it("retains the user's generation controls for refresh recovery", () => {
    savePendingGeneration({
      requestId: "request-123",
      runId: "run-123",
      savedAt: "2026-07-29T10:00:00.000Z",
      input: {
        ideaText: "A sufficiently detailed product update for recovery.",
        goal: "lead-gen",
        persona: "ai-saas",
        platforms: ["x", "linkedin"],
        growthMissionId: null,
        xhsWorkflowId: null,
        artifactVersionIds: [],
        mediaAssets: [],
        locale: "en"
      }
    });

    expect(loadPendingGeneration()).toMatchObject({
      requestId: "request-123",
      runId: "run-123",
      input: {
        platforms: ["x", "linkedin"]
      }
    });

    clearPendingGeneration();
    expect(
      window.localStorage.getItem(ACTIVE_GENERATION_STORAGE_KEY)
    ).toBeNull();
  });

  it("exposes localized, truthful task stages", () => {
    expect(generationRunStepLabel("reserve_credits", "en")).toBe(
      "Securing AI Credits"
    );
    expect(generationRunStepLabel("persist_kit", "zh")).toBe("保存内容包");
  });
});
