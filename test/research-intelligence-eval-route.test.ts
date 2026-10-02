import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  loadOwnedResearchMission: vi.fn(),
  generateKitOutputs: vi.fn(),
  moderateInput: vi.fn(),
  checkRateLimit: vi.fn()
}));

vi.mock("@/lib/auth-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
vi.mock("@/lib/operations/research-store", () => ({ loadOwnedResearchMission: mocks.loadOwnedResearchMission }));
vi.mock("@/lib/llm", () => ({ generateKitOutputs: mocks.generateKitOutputs }));
vi.mock("@/lib/moderation", () => ({ moderateInput: mocks.moderateInput }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  getClientIp: () => "127.0.0.1"
}));

import { POST } from "@/app/api/admin/research-intelligence-eval/pair/route";

const missionId = "20000000-0000-4000-8000-000000000001";
const mission = {
  id: missionId,
  operatingProgramId: null,
  missionType: "category_opportunity" as const,
  title: "AI 内容机会",
  question: "哪些问题值得优先验证？",
  subjects: ["AI 内容"],
  evidence: [{ id: "E1", sourceType: "public_web" as const, title: "公开观察", excerpt: "用户反复询问如何把想法变成稳定流程。", reliability: "observed" as const }],
  status: "ready" as const,
  decision: {
    executiveSummary: "用户需要更具体的步骤。",
    opportunities: [{ title: "流程拆解", rationale: "用户需要执行证据。", evidenceIds: ["E1"], confidence: "medium" as const }],
    risks: [],
    strategy: { thesis: "用流程回应执行焦虑。", contentPillars: ["流程"], next14Days: ["发布一组流程内容"], conversionPath: "笔记 → 主页", successMetrics: ["主页访问"] },
    limitations: ["公开观察不能证明因果。"]
  },
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z"
};
const output = {
  platform: "xiaohongshu",
  title: "把研究结论变成可验证内容",
  body: "先写清用户问题，再给出一份可以执行和复盘的步骤。",
  cta: "保存这份检查单",
  notes: "使用一组可比较的内容变量。",
  strategy: "围绕真实用户问题组织内容。",
  locked: false,
  publishStatus: "draft",
  userEdited: false
};

function pairRequest(overrides: Record<string, unknown> = {}) {
  return new Request("https://finfold.test/api/admin/research-intelligence-eval/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      missionId,
      goal: "lead-gen",
      persona: "ai-saas",
      platform: "xiaohongshu",
      language: "zh",
      modelTier: "haiku",
      confirmProviderSpend: true,
      ...overrides
    })
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue("admin-user");
  mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
  mocks.loadOwnedResearchMission.mockResolvedValue(mission);
  mocks.checkRateLimit.mockReturnValue(true);
  mocks.moderateInput.mockReturnValue({ flagged: false, reason: null });
  mocks.generateKitOutputs.mockImplementation(async (_input, options) => {
    await options?.onModelAttempt?.({
      provider: "test",
      model: "test-model",
      promptVersion: "test-v1",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      estimatedCostUsd: 0.01
    });
    return [output];
  });
});

describe("POST /api/admin/research-intelligence-eval/pair", () => {
  it("generates one stateless pair from an owned ready mission and records pair validity", async () => {
    const response = await POST(pairRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.loadOwnedResearchMission).toHaveBeenCalledWith(expect.anything(), "admin-user", missionId);
    expect(mocks.generateKitOutputs).toHaveBeenCalledTimes(2);
    const inputs = mocks.generateKitOutputs.mock.calls.map(([input]) => input);
    expect(inputs.filter((input) => input.intelligenceContext)).toHaveLength(1);
    expect(inputs.filter((input) => !input.intelligenceContext)).toHaveLength(1);
    for (const [, options] of mocks.generateKitOutputs.mock.calls) {
      expect(options).toMatchObject({ modelTier: "haiku", allowPersistentAgentFallback: false });
    }
    expect(data.evaluationCase.control.generation.estimatedCostUsd).toBe(0.01);
    expect(data.evaluationCase.treatment.generation.estimatedCostUsd).toBe(0.01);
    expect(data.evaluationCase.pairValidity).toEqual({ status: "valid", reasons: [] });
  });

  it("marks a pair invalid when a provider failover leaves the arms on different final models", async () => {
    mocks.generateKitOutputs.mockImplementation(async (input, options) => {
      await options?.onModelAttempt?.({
        provider: input.intelligenceContext ? "fallback" : "test",
        model: input.intelligenceContext ? "fallback-model" : "test-model",
        promptVersion: "test-v1",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCostUsd: 0.01
      });
      return [output];
    });
    const response = await POST(pairRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.evaluationCase.pairValidity).toEqual({
      status: "invalid",
      reasons: ["final_provider_model_mismatch"]
    });
  });

  it("rejects an anonymous caller before any model call", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Unauthorized"));
    const response = await POST(pairRequest());
    expect(response.status).toBe(401);
    expect(mocks.generateKitOutputs).not.toHaveBeenCalled();
  });

  it("rejects a non-admin caller before any model call", async () => {
    const forbidden = new Error("Forbidden");
    forbidden.name = "Forbidden";
    mocks.requireAdmin.mockRejectedValue(forbidden);
    const response = await POST(pairRequest());
    expect(response.status).toBe(403);
    expect(mocks.generateKitOutputs).not.toHaveBeenCalled();
  });

  it("makes zero model calls when the mission belongs to another tenant", async () => {
    mocks.loadOwnedResearchMission.mockResolvedValue(null);
    const response = await POST(pairRequest());
    expect(response.status).toBe(404);
    expect(mocks.generateKitOutputs).not.toHaveBeenCalled();
  });

  it("makes zero model calls when the mission is not ready", async () => {
    mocks.loadOwnedResearchMission.mockResolvedValue({ ...mission, status: "researching", decision: null });
    const response = await POST(pairRequest());
    expect(response.status).toBe(409);
    expect(mocks.generateKitOutputs).not.toHaveBeenCalled();
  });

  it("still requires an explicit provider-spend confirmation", async () => {
    const response = await POST(pairRequest({ confirmProviderSpend: undefined }));
    expect(response.status).toBe(400);
    expect(mocks.generateKitOutputs).not.toHaveBeenCalled();
    const falseConfirmation = await POST(pairRequest({ confirmProviderSpend: false }));
    expect(falseConfirmation.status).toBe(400);
    expect(mocks.generateKitOutputs).not.toHaveBeenCalled();
  });

  it("rejects browser-submitted intelligence context so only the server-read mission is trusted", async () => {
    const response = await POST(pairRequest({
      intelligenceContext: { missionTitle: "client-side fabrication" }
    }));
    expect(response.status).toBe(400);
    expect(mocks.generateKitOutputs).not.toHaveBeenCalled();
  });

  it("reports attempts and cost already spent when one arm fails, without retrying", async () => {
    let calls = 0;
    mocks.generateKitOutputs.mockImplementation(async (_input, options) => {
      calls += 1;
      await options?.onModelAttempt?.({
        provider: "test",
        model: "test-model",
        promptVersion: "test-v1",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCostUsd: 0.01
      });
      if (calls === 2) throw new Error("second arm provider failure");
      return [output];
    });
    const response = await POST(pairRequest());
    const data = await response.json();
    expect(response.status).toBe(502);
    expect(data.error).toContain("second arm provider failure");
    // Both attempts already billed the provider; the operator must see them.
    expect(data.failedCall.estimatedCostUsd).toBe(0.02);
    const recordedAttempts = [
      ...data.failedCall.attempts.control,
      ...data.failedCall.attempts.treatment
    ];
    expect(recordedAttempts).toHaveLength(2);
    expect(recordedAttempts[0]).toMatchObject({ provider: "test", model: "test-model" });
    expect(mocks.generateKitOutputs).toHaveBeenCalledTimes(2);
  });
});
