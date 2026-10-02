// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateWechatReview,
  stripHtmlToText,
  WECHAT_REVIEW_LIMITS,
  WECHAT_REVIEW_MAX_CONTENT_CHARS,
  wechatReviewFindings
} from "@/lib/wechat-jev-review";

const runReviewMock = vi.hoisted(() => vi.fn());
const logInfoMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/jev", () => ({ askJev: vi.fn() }));
vi.mock("@/lib/observability", () => ({ logInfo: logInfoMock }));
vi.mock("@/lib/wechat-jev-review", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wechat-jev-review")>();
  return { ...actual, runWechatJevReview: runReviewMock };
});
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => true }));
vi.mock("@/lib/content-readiness", () => ({
  assessContentReadiness: () => ({ publishability: { status: "ok", summary: "ok", findings: [] } })
}));
vi.mock("@/lib/source-image", () => ({
  outputImageSourceSchema: { safeParse: () => ({ success: false }) },
  requiresImageRightsConfirmation: () => false
}));
vi.mock("@/lib/social-connections", () => ({
  listSocialConnectionsWithAccounts: async () => [{
    connectorId: "wechat",
    status: "connected",
    grantedScopes: [],
    accounts: [{ id: "33333333-3333-4333-8333-333333333333", displayName: "测试公众号", providerMetadata: {} }]
  }]
}));
vi.mock("@/lib/wechat-publication", () => ({
  wechatPublicationModes: ["draft_only", "scheduled_publish"],
  wechatPublicationStatuses: [
    "scheduled", "needs_reapproval", "preparing", "draft_ready", "submitted",
    "publishing", "published", "failed", "cancelled", "removed", "blocked", "attention_required"
  ],
  describeWechatPublicationStatus: () => "已排期",
  mapWechatProviderPublicationStatus: () => "publishing",
  deriveWechatPublishingCapability: () => ({ canCreateDraft: true, canSubmitPublish: true, blockers: [], verified: true, serviceType: 2 }),
  buildWechatPublicationSnapshot: () => ({
    title: "标题", summary: "摘要", contentHtml: "<p>正文</p>", coverImageUrl: "https://example.com/cover.jpg",
    inlineImageUrls: [], theme: "default", outputUpdatedAt: "2026-09-22T00:00:00.000Z"
  }),
  fingerprintWechatPublicationSnapshot: async () => "a".repeat(64),
  validateWechatPublicationSnapshot: () => ({ ok: true })
}));

import { POST } from "@/app/api/kits/[kitId]/outputs/[outputId]/wechat-publications/route";

function cleanAnswers(): Record<string, unknown> {
  return {
    fabricated_data: { type: "noul", noul: 0.02 },
    clickbait_hype: { type: "noul", noul: 0.08 },
    compliance_risk: { type: "noul", noul: 0.05 },
    ai_tell: { type: "noul", noul: 0.1 },
    quality: { type: "score", score: 3.6 }
  };
}

describe("wechat review pure evaluation", () => {
  it("keeps exact-threshold values inside the pass band", () => {
    const answers: Record<string, unknown> = {
      fabricated_data: { type: "noul", noul: WECHAT_REVIEW_LIMITS.maxFabricatedData },
      clickbait_hype: { type: "noul", noul: WECHAT_REVIEW_LIMITS.maxClickbaitHype },
      compliance_risk: { type: "noul", noul: WECHAT_REVIEW_LIMITS.maxComplianceRisk },
      ai_tell: { type: "noul", noul: WECHAT_REVIEW_LIMITS.maxAiTell },
      quality: { type: "score", score: WECHAT_REVIEW_LIMITS.minQualityScore }
    };
    expect(evaluateWechatReview(answers)).toMatchObject({ decision: "pass", reasons: [] });
  });
  it.each([
    ["fabricated_data", "maxFabricatedData", "fabricated_data_risk"],
    ["clickbait_hype", "maxClickbaitHype", "clickbait_hype_risk"],
    ["compliance_risk", "maxComplianceRisk", "compliance_risk"],
    ["ai_tell", "maxAiTell", "ai_tell_risk"]
  ] as const)("blocks a %s breach", (key, limit, reason) => {
    const answers = cleanAnswers();
    answers[key] = { type: "noul", noul: WECHAT_REVIEW_LIMITS[limit] + 0.001 };
    expect(evaluateWechatReview(answers)).toMatchObject({ decision: "blocked", reasons: [reason] });
  });
  it("blocks a quality score below the floor but passes the exact floor", () => {
    const below = cleanAnswers();
    below.quality = { type: "score", score: WECHAT_REVIEW_LIMITS.minQualityScore - 0.01 };
    expect(evaluateWechatReview(below).reasons).toEqual(["quality_below_floor"]);
  });
  it("fails blocked when an answer is missing or wrongly typed", () => {
    const partial = cleanAnswers();
    delete partial.quality;
    expect(evaluateWechatReview(partial).reasons).toEqual(["jev_answer_missing"]);
    const wrongType = cleanAnswers();
    wrongType.ai_tell = { type: "noul" };
    expect(evaluateWechatReview(wrongType).reasons).toEqual(["jev_answer_missing"]);
  });
  it("strips styles, scripts, tags and entities, collapses whitespace, truncates", () => {
    const noisy = `<style>.x{color:red}</style><script>alert(1)</script><p>Hello&nbsp;&amp;&lt;world&gt;</p>\n\n  <b>done</b>`;
    expect(stripHtmlToText(noisy)).toBe("Hello &<world> done");
    expect(stripHtmlToText("x".repeat(WECHAT_REVIEW_MAX_CONTENT_CHARS + 100))).toHaveLength(WECHAT_REVIEW_MAX_CONTENT_CHARS);
  });
  it("maps reasons to user-facing findings, passing unknown ones through", () => {
    const findings = wechatReviewFindings(["fabricated_data_risk", "mystery_reason"]);
    expect(findings).toEqual(["疑似包含来源无法支撑的具体数据或事实。", "mystery_reason"]);
  });
});

// Route fixtures live at module scope: vi.mock factories are hoisted above
// the describe bodies, so their closures must resolve at module level.
const userId = "11111111-1111-4111-8111-111111111111";
const kitId = "44444444-4444-4444-8444-444444444444";
const outputId = "55555555-5555-4555-8555-555555555555";
const outputUpdatedAt = "2026-09-22T00:00:00.000Z";
const outputRow = {
  id: outputId, platform: "wechat", title: "标题", body: "正文", summary: "摘要", cta: "",
  final_body: null, image_url: null, image_source: null, updated_at: outputUpdatedAt
};
const writes: Array<{ table: string; values: Record<string, unknown> }> = [];
const tables: Record<string, { data?: unknown; error?: unknown }> = {};
const admin = {
  from(table: string) {
    const chain: Record<string, unknown> = {};
    chain.then = (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null, ...tables[table] }).then(resolve, reject);
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.is = () => chain;
    chain.order = () => chain;
    chain.maybeSingle = async () => ({ data: null, error: null, ...tables[table] });
    chain.single = async () => ({ data: null, error: null, ...tables[table] });
    return {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null, ...tables[table] }),
      insert: (values: Record<string, unknown>) => {
        writes.push({ table, values });
        tables[table] = { data: { ...values, id: "66666666-6666-4666-8666-666666666666", published_at: null, created_at: new Date().toISOString() } };
        return chain;
      }
    };
  }
};
vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: async () => userId,
  createSupabaseAdminClient: () => admin
}));

describe("wechat publications route Jev gate", () => {
  const accountId = "33333333-3333-4333-8333-333333333333";

  function call(forceAfterJev?: boolean) {
    const body = {
      accountId,
      mode: "draft_only",
      scheduledFor: new Date().toISOString(),
      contentVersion: outputUpdatedAt,
      idempotencyKey: crypto.randomUUID(),
      theme: "default",
      ...(forceAfterJev ? { forceAfterJev: true } : {})
    };
    const request = new Request("https://www.finfold.app/api", { method: "POST", body: JSON.stringify(body) });
    return POST(request, { params: Promise.resolve({ kitId, outputId }) });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    for (const key of Object.keys(tables)) delete tables[key];
    tables.kit_outputs = { data: outputRow };
    runReviewMock.mockResolvedValue({
      decision: "pass", reasons: [],
      metrics: { fabricatedData: 0.02, clickbaitHype: 0.08, complianceRisk: 0.05, aiTell: 0.1, quality: 3.6 },
      model: "jev-1.13.0", at: new Date().toISOString()
    });
  });

  it("stores the audit record on a pass", async () => {
    const response = await call();
    expect(response.status).toBe(202);
    const jobWrites = writes.filter(write => write.table === "wechat_publication_jobs");
    expect(jobWrites).toHaveLength(1);
    expect((jobWrites[0].values.auto_review as { decision: string }).decision).toBe("pass");
    expect(runReviewMock).toHaveBeenCalledWith(userId, {
      title: "标题", summary: "摘要", contentHtml: "<p>正文</p>"
    });
  });

  it("returns 409 findings without inserting when blocked and not forced", async () => {
    runReviewMock.mockResolvedValue({
      decision: "blocked", reasons: ["fabricated_data_risk", "quality_below_floor"],
      metrics: { fabricatedData: 0.9, clickbaitHype: 0.1, complianceRisk: 0.1, aiTell: 0.1, quality: 1.2 },
      model: "jev-1.13.0", at: new Date().toISOString()
    });
    const response = await call();
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("jev_review_blocked");
    expect(body.findings).toEqual(["疑似包含来源无法支撑的具体数据或事实。", "内容质量低于自动放行下限。"]);
    expect(writes.filter(write => write.table === "wechat_publication_jobs")).toHaveLength(0);
  });

  it("publishes with an overridden record when forced after a block", async () => {
    runReviewMock.mockResolvedValue({
      decision: "blocked", reasons: ["compliance_risk"],
      metrics: { fabricatedData: 0.1, clickbaitHype: 0.1, complianceRisk: 0.9, aiTell: 0.1, quality: 3.6 },
      model: "jev-1.13.0", at: new Date().toISOString()
    });
    const response = await call(true);
    expect(response.status).toBe(202);
    const jobWrites = writes.filter(write => write.table === "wechat_publication_jobs");
    expect(jobWrites).toHaveLength(1);
    expect((jobWrites[0].values.auto_review as { overridden: boolean }).overridden).toBe(true);
  });

  it("fails open when the review itself is unavailable", async () => {
    runReviewMock.mockRejectedValue(new Error("jev_disabled"));
    const response = await call();
    expect(response.status).toBe(202);
    const jobWrites = writes.filter(write => write.table === "wechat_publication_jobs");
    expect(jobWrites).toHaveLength(1);
    expect(jobWrites[0].values).not.toHaveProperty("auto_review");
    expect(logInfoMock).toHaveBeenCalledWith("jev_unavailable", { userId }, {
      operation: "wechat_publication_review",
      reason: "jev_disabled"
    });
  });
});
