import { beforeEach, describe, expect, it, vi } from "vitest";
import { replyDraftRequestSchema } from "@/lib/extension/reply-contracts";
import { sha256Hex } from "@/lib/extension/crypto";
import { buildReplyPrompt } from "@/lib/extension/reply-generation";
import { runReplyDraft } from "@/lib/extension/reply-service";
import {
  audienceToneGuidance,
  buildExtensionReplyTriageQuestions,
  triageExtensionReply
} from "@/lib/extension/reply-triage";

const mocks = vi.hoisted(() => ({
  llm: vi.fn(), vision: vi.fn(), from: vi.fn(), reserve: vi.fn(), settle: vi.fn(), refund: vi.fn(), recoverSettle: vi.fn(),
  entitlement: vi.fn(), available: vi.fn(), providers: vi.fn(), askJev: vi.fn(), jevEnabled: vi.fn()
}));
vi.mock("@/lib/jev", () => ({ askJev: mocks.askJev, jevEnabled: mocks.jevEnabled }));
vi.mock("@/lib/llm", () => ({ sendUntrustedContentPrompt: mocks.llm, sendRawPromptWithImages: mocks.vision }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/payment/ai-usage-billing", () => ({ createAiUsageBilling: () => ({ reserveAndStart: mocks.reserve, settle: mocks.settle, refund: mocks.refund }) }));
vi.mock("@/lib/payment", () => ({ getAvailableCredits: mocks.available, settleAiUsageOperation: mocks.recoverSettle }));
vi.mock("@/lib/extension/service", () => ({ getExtensionEntitlement: mocks.entitlement, extensionActionCost: () => 3 }));
vi.mock("@/lib/llm-providers", () => ({ resolveLLMProviders: mocks.providers }));

const userId = "11111111-1111-4111-8111-111111111111";
const input = () => replyDraftRequestSchema.parse({ requestId: "22222222-2222-4222-8222-222222222222", platform: "xiaohongshu", comment: "怎么买？" });
const draft = { status: "draft", body: "谢谢关注！", factsToCheck: [] };
const queries: Array<{ table: string; filters: unknown[][]; insert?: unknown }> = [];
let tables: Record<string, { data?: unknown; error?: unknown; count?: number }>;
beforeEach(() => {
  vi.clearAllMocks(); queries.length = 0;
  tables = {};
  mocks.from.mockImplementation((table: string) => {
    const record: { table: string; filters: unknown[][]; insert?: unknown } = { table, filters: [] };
    queries.push(record);
    const q = {
      select: (..._args: unknown[]) => q,
      eq: (...args: unknown[]) => { record.filters.push(args); return q; },
      neq: (...args: unknown[]) => { record.filters.push(args); return q; },
      like: (...args: unknown[]) => { record.filters.push(args); return q; },
      gte: (...args: unknown[]) => { record.filters.push(args); return q; },
      maybeSingle: async () => ({ data: null, error: null, ...tables[table] }),
      insert: async (value: unknown) => { record.insert = value; return { error: null, ...tables[table] }; },
      then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
        Promise.resolve({ count: tables[table]?.count ?? 0, error: tables[table]?.error ?? null }).then(resolve, reject)
    };
    return q;
  });
  mocks.jevEnabled.mockReturnValue(true);
  mocks.askJev.mockResolvedValue({
    model: "jev-1.13.0",
    answers: {
      worth_replying: { type: "noul", noul: 0.9 },
      audience_type: { type: "choice", choice: "potential_customer", probabilities: {}, confidence: null }
    },
    usage: { inputTokens: 200, outputTokens: 0 }
  });
  mocks.reserve.mockResolvedValue({ outcome: "authorized", available: 27 });
  mocks.settle.mockResolvedValue(undefined); mocks.refund.mockResolvedValue(undefined);
  mocks.recoverSettle.mockResolvedValue("settled"); mocks.available.mockResolvedValue(27);
  mocks.entitlement.mockResolvedValue({ providerPolicy: "all" });
  mocks.providers.mockReturnValue([]);
  mocks.llm.mockResolvedValue(JSON.stringify(draft));
  mocks.vision.mockResolvedValue(JSON.stringify(draft));
});

describe("extension reply triage questions and tone", () => {
  it("differs per platform with the same five audience classes", () => {
    const xhs = buildExtensionReplyTriageQuestions("xiaohongshu");
    const linkedin = buildExtensionReplyTriageQuestions("linkedin");
    expect(Object.keys(xhs)).toEqual(["worth_replying", "audience_type"]);
    expect(xhs.worth_replying.instructions).toContain("Xiaohongshu");
    expect(linkedin.worth_replying.instructions).toContain("LinkedIn");
    expect(Object.keys((xhs.audience_type as { criteria: Record<string, string> }).criteria))
      .toEqual(["potential_customer", "peer_builder", "noise", "hostile", "other"]);
    expect((xhs.audience_type as { criteria: Record<string, string> }).criteria.noise)
      .not.toBe((linkedin.audience_type as { criteria: Record<string, string> }).criteria.noise);
  });
  it("injects COMMENT TRIAGE right after AUTHOR REPLY INTENT and maps all five tones", () => {
    const prompt = buildReplyPrompt(input(), undefined, { audienceType: "peer_builder", worthReplying: 0.86 });
    const lines = prompt.split("\n\n");
    const intent = lines.findIndex(line => line.startsWith("AUTHOR REPLY INTENT:"));
    expect(lines[intent + 1]).toContain("COMMENT TRIAGE (Jev): audience_type=peer_builder, worth_replying=0.86");
    expect(lines[intent + 1]).toContain(audienceToneGuidance("peer_builder"));
    expect(audienceToneGuidance("potential_customer")).toContain("do not push a sale");
    expect(audienceToneGuidance("hostile")).toContain("at most one calm");
    expect(audienceToneGuidance("noise")).toContain("brief polite acknowledgement");
    expect(audienceToneGuidance("other")).toContain("stay neutral");
    expect(buildReplyPrompt(input())).not.toContain("COMMENT TRIAGE");
  });
  it("maps an unknown choice to other and skips unusable answers", async () => {
    mocks.askJev.mockResolvedValue({
      model: "jev-1.13.0",
      answers: {
        worth_replying: { type: "noul", noul: 0.5 },
        audience_type: { type: "choice", choice: "alien", probabilities: {}, confidence: null }
      },
      usage: { inputTokens: 1, outputTokens: 0 }
    });
    expect(await triageExtensionReply(input(), null)).toEqual({ audienceType: "other", worthReplying: 0.5 });
    mocks.askJev.mockResolvedValue({
      model: "jev-1.13.0", answers: { worth_replying: { type: "noul", noul: 0.5 } },
      usage: { inputTokens: 1, outputTokens: 0 }
    });
    expect(await triageExtensionReply(input(), null)).toBeNull();
  });
});

describe("triage in the reply service", () => {
  it("persists and returns the triage verdict on a fresh generation", async () => {
    const outcome = await runReplyDraft(userId, input());
    expect(mocks.askJev).toHaveBeenCalledTimes(1);
    expect(outcome.triage).toEqual({ audienceType: "potential_customer", worthReplying: 0.9 });
    const stored = queries.find(query => query.table === "extension_reply_results")?.insert as Record<string, unknown>;
    expect(stored.triage).toEqual({ audienceType: "potential_customer", worthReplying: 0.9 });
    // Billing sequence is unchanged by the triage step.
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect(mocks.refund).not.toHaveBeenCalled();
  });
  it("replays a cached triage with the recovered result", async () => {
    tables["ai_usage_operations"] = { data: { id: "op", status: "settled", detail: { inputHash: await sha256Hex(JSON.stringify(input())) } } };
    tables["extension_reply_results"] = {
      data: { result: draft, expires_at: new Date(Date.now() + 3_600_000).toISOString(), triage: { audienceType: "peer_builder", worthReplying: 0.77 } }
    };
    mocks.reserve.mockResolvedValue({ outcome: "existing", status: "settled" });
    const outcome = await runReplyDraft(userId, input());
    expect(outcome.result).toEqual(draft);
    expect(outcome.triage).toEqual({ audienceType: "peer_builder", worthReplying: 0.77 });
    expect(mocks.askJev).not.toHaveBeenCalled();
  });
  it("never asks Jev about a screenshot-only comment", async () => {
    const jpeg = `data:image/jpeg;base64,${"A".repeat(64)}`;
    await runReplyDraft(userId, replyDraftRequestSchema.parse({ requestId: "22222222-2222-4222-8222-222222222222", platform: "xiaohongshu", comment: "", commentImage: jpeg }));
    expect(mocks.askJev).not.toHaveBeenCalled();
    const stored = queries.find(query => query.table === "extension_reply_results")?.insert as Record<string, unknown>;
    expect(stored).not.toHaveProperty("triage");
  });
  it("fails open to a triage-free envelope when Jev is unavailable", async () => {
    mocks.askJev.mockRejectedValue(new Error("jev_disabled"));
    const outcome = await runReplyDraft(userId, input());
    expect(outcome).toEqual({ result: draft, cost: 3, availableCredits: 27 });
    expect(outcome).not.toHaveProperty("triage");
    const stored = queries.find(query => query.table === "extension_reply_results")?.insert as Record<string, unknown>;
    expect(stored).not.toHaveProperty("triage");
    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect(mocks.refund).not.toHaveBeenCalled();
  });
});
