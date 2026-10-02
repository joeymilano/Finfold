import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  generate: vi.fn(),
  getKit: vi.fn(),
  listKits: vi.fn(),
  getContext: vi.fn(),
  getBrandMemory: vi.fn(),
  updateBrandMemory: vi.fn(),
  getGrowthBriefing: vi.fn(),
  capture: vi.fn()
}));

vi.mock("@/lib/mcp/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mcp/oauth")>();
  return { ...actual, verifyPublicMcpAuthorization: mocks.verify };
});
vi.mock("@/lib/mcp/service", () => ({
  generateMcpKit: mocks.generate,
  getMcpContentKit: mocks.getKit,
  listMcpContentKits: mocks.listKits,
  getMcpBrandContext: mocks.getContext,
  getMcpBrandMemory: mocks.getBrandMemory,
  updateMcpBrandMemory: mocks.updateBrandMemory,
  getMcpGrowthBriefing: mocks.getGrowthBriefing
}));
vi.mock("@/lib/posthog-server", () => ({ captureServerEvent: mocks.capture }));

import { POST } from "@/app/mcp/route";
import { GET as GET_PROTECTED_RESOURCE } from "@/app/.well-known/oauth-protected-resource/route";
import { PublicMcpOAuthError } from "@/lib/mcp/oauth";
import { FINFOLD_PUBLIC_TOOLS } from "@/lib/mcp/public-server";

const userId = "f7c08e55-3e0c-44d9-a0e3-718b3a9a798a";
const clientId = "53f87bfd-3d4b-4e67-83d7-cd28d6ba2d3d";
const requestId = "389fb22d-f9fd-4ac1-a9d2-dc657db5f849";
const kitId = "6fdf1d8a-aa38-4f3c-a6cf-ef94f91872ea";

function request(method: string, params?: unknown, headers: Record<string, string> = {}) {
  return new Request("https://www.finfold.app/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
      ...headers
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
}

function authInfo() {
  return {
    token: "signed-token",
    clientId,
    scopes: ["openid"],
    resource: new URL("https://www.finfold.app/mcp"),
    extra: { userId }
  };
}

function savedKit() {
  return {
    id: kitId,
    ideaText: "A detailed launch brief for a useful product update.",
    goal: "product-launch" as const,
    persona: "indie-builder" as const,
    platforms: ["linkedin" as const],
    mediaAssets: [],
    outputs: [{
      id: crypto.randomUUID(),
      platform: "linkedin" as const,
      title: "A calmer content workflow",
      body: "Turn one grounded brief into a channel-ready draft.",
      cta: "Review the saved kit.",
      notes: "Draft only.",
      strategy: "Lead with the workflow outcome.",
      locked: false,
      publishStatus: "draft" as const,
      userEdited: false
    }],
    status: "saved" as const,
    createdAt: "2026-09-04T08:00:00.000Z"
  };
}

describe("public Finfold MCP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(undefined);
  });

  it("publishes protected-resource metadata for the canonical MCP resource", async () => {
    const response = await GET_PROTECTED_RESOURCE();
    expect(await response.json()).toMatchObject({
      resource: "https://www.finfold.app/mcp",
      scopes_supported: ["openid"],
      bearer_methods_supported: ["header"],
      resource_documentation: "https://www.finfold.app/for-agents",
      resource_policy_uri: "https://www.finfold.app/privacy",
      resource_tos_uri: "https://www.finfold.app/terms"
    });
  });

  it("exposes the six review-scoped tools with OAuth and accurate annotations", () => {
    expect(FINFOLD_PUBLIC_TOOLS.map((tool) => tool.name)).toEqual([
      "finfold_list_content_kits",
      "finfold_create_content_kit",
      "finfold_get_content_kit",
      "finfold_get_brand_memory",
      "finfold_update_brand_memory",
      "finfold_get_growth_briefing"
    ]);
    for (const tool of FINFOLD_PUBLIC_TOOLS) {
      expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: ["openid"] }]);
      expect(tool._meta?.securitySchemes).toEqual(tool.securitySchemes);
    }
    expect(FINFOLD_PUBLIC_TOOLS[1].annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    const requestIdSchema = FINFOLD_PUBLIC_TOOLS[1].inputSchema.properties?.request_id as { description?: string };
    expect(requestIdSchema.description).toMatch(/same saved kit without charging again/i);
    expect(FINFOLD_PUBLIC_TOOLS[0].annotations?.readOnlyHint).toBe(true);
    expect(FINFOLD_PUBLIC_TOOLS[2].annotations?.readOnlyHint).toBe(true);
    expect(FINFOLD_PUBLIC_TOOLS[1]._meta).toMatchObject({
      ui: { resourceUri: "ui://finfold/content-kit-v1.html" }
    });
    expect(FINFOLD_PUBLIC_TOOLS[3].annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    });
    expect(FINFOLD_PUBLIC_TOOLS[4].annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true
    });
    expect(FINFOLD_PUBLIC_TOOLS[5].annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    });
  });

  it("preserves OpenAI OAuth metadata in the MCP tools/list response", async () => {
    const response = await POST(request("tools/list"));
    const body = await response.json();
    expect(body.result.tools).toHaveLength(6);
    expect(body.result.tools[1]).toMatchObject({
      name: "finfold_create_content_kit",
      securitySchemes: [{ type: "oauth2", scopes: ["openid"] }],
      _meta: { ui: { resourceUri: "ui://finfold/content-kit-v1.html" } }
    });
  });

  it("lists recent kits without returning full draft bodies", async () => {
    mocks.verify.mockResolvedValue(authInfo());
    mocks.listKits.mockResolvedValue({
      kits: [{
        kitId,
        title: "A calmer content workflow",
        briefExcerpt: "A detailed launch brief for a useful product update.",
        platforms: ["linkedin"],
        status: "saved",
        createdAt: "2026-09-04T08:00:00.000Z"
      }],
      hasMore: false
    });
    const response = await POST(request("tools/call", {
      name: "finfold_list_content_kits",
      arguments: { limit: 5 }
    }, { authorization: "Bearer signed-token" }));
    const body = await response.json();

    expect(mocks.listKits).toHaveBeenCalledWith(userId, 5);
    expect(body.result.structuredContent).toMatchObject({
      kits: [{
        kit_id: kitId,
        title: "A calmer content workflow",
        open_url: expect.stringContaining(`/kits/${kitId}?utm_source=chatgpt_plugin`)
      }],
      has_more: false
    });
    expect(JSON.stringify(body.result.structuredContent)).not.toMatch(/channel-ready draft/);
  });

  it("returns a tool-level OAuth challenge before any account data is accessed", async () => {
    const response = await POST(request("tools/call", {
      name: "finfold_create_content_kit",
      arguments: { request_id: requestId, brief: "A sufficiently detailed brief for the launch.", platforms: ["linkedin"] }
    }));
    const body = await response.json();
    expect(body.result.isError).toBe(true);
    expect(body.result._meta["mcp/www_authenticate"][0]).toContain("/.well-known/oauth-protected-resource");
    expect(body.result._meta["mcp/www_authenticate"][0]).toContain('error="insufficient_scope"');
    expect(body.result._meta["mcp/www_authenticate"][0]).toContain('error_description="Connect your Finfold account to continue."');
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("returns an HTTP 401 challenge when a presented access token is invalid", async () => {
    mocks.verify.mockRejectedValue(new PublicMcpOAuthError());
    const response = await POST(request("tools/list", undefined, {
      authorization: "Bearer invalid-token"
    }));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata=");
  });

  it("generates and returns a real saved-kit result for an authorized user", async () => {
    mocks.verify.mockResolvedValue(authInfo());
    mocks.generate.mockResolvedValue({ kit: savedKit(), hasBrandMemory: true });
    const response = await POST(request("tools/call", {
      name: "finfold_create_content_kit",
      arguments: {
        request_id: requestId,
        brief: "A sufficiently detailed brief for a useful product launch.",
        platforms: ["linkedin"],
        language: "en"
      }
    }, { authorization: "Bearer signed-token" }));
    const body = await response.json();

    expect(body.result.structuredContent).toMatchObject({
      kit_id: kitId,
      has_brand_memory: true,
      open_url: expect.stringContaining(`/kits/${kitId}?utm_source=chatgpt_plugin`)
    });
    expect(body.result.structuredContent).not.toHaveProperty("created_at");
    expect(mocks.generate).toHaveBeenCalledWith(userId, expect.objectContaining({ platforms: ["linkedin"] }), {
      tokenId: `oauth:${clientId}`,
      idempotencyKey: requestId
    });
  });

  it("returns the connected user's Brand Memory without exposing internal ids", async () => {
    mocks.verify.mockResolvedValue(authInfo());
    mocks.getBrandMemory.mockResolvedValue({
      identity_type: "personal",
      brand_name: "Joey Labs",
      product_description: "AI product design consulting for indie builders",
      target_audience: "Solo founders in China",
      positioning_statement: "",
      tone_keywords: ["calm", "specific"],
      banned_phrases: ["game-changer"],
      approved_examples: [],
      competitors: [],
      learned_style: ["Prefer concrete numbers over adjectives"],
      learned_negative: [],
      completeness: 0.6,
      has_brand_memory: true
    });
    const response = await POST(request("tools/call", {
      name: "finfold_get_brand_memory",
      arguments: {}
    }, { authorization: "Bearer signed-token" }));
    const body = await response.json();

    expect(mocks.getBrandMemory).toHaveBeenCalledWith(userId);
    expect(body.result.structuredContent).toMatchObject({
      identity_type: "personal",
      brand_name: "Joey Labs",
      banned_phrases: ["game-changer"],
      learned_style: ["Prefer concrete numbers over adjectives"],
      has_brand_memory: true
    });
    expect(body.result.content[0].text).toContain("Brand Memory");
  });

  it("merges confirmed brand facts into Brand Memory and reports changed fields", async () => {
    mocks.verify.mockResolvedValue(authInfo());
    mocks.updateBrandMemory.mockResolvedValue({
      updated: true,
      brand_name: "Joey Labs",
      changed_fields: ["target_audience", "banned_phrases"],
      completeness: 0.75
    });
    const response = await POST(request("tools/call", {
      name: "finfold_update_brand_memory",
      arguments: {
        target_audience: "Solo founders shipping AI products",
        banned_phrases: ["revolutionary"]
      }
    }, { authorization: "Bearer signed-token" }));
    const body = await response.json();

    expect(mocks.updateBrandMemory).toHaveBeenCalledWith(userId, {
      target_audience: "Solo founders shipping AI products",
      banned_phrases: ["revolutionary"]
    });
    expect(body.result.structuredContent).toMatchObject({
      updated: true,
      changed_fields: ["target_audience", "banned_phrases"]
    });
    expect(body.result.content[0].text).toContain("Brand Memory updated");
  });

  it("requires an empty-object update to be rejected as invalid input", async () => {
    mocks.verify.mockResolvedValue(authInfo());
    const response = await POST(request("tools/call", {
      name: "finfold_update_brand_memory",
      arguments: {}
    }, { authorization: "Bearer signed-token" }));
    const body = await response.json();

    expect(body.result.isError).toBe(true);
    expect(body.result._meta["finfold/error_code"]).toBe("invalid_input");
    expect(mocks.updateBrandMemory).not.toHaveBeenCalled();
  });

  it("returns a growth briefing built from real imported samples", async () => {
    mocks.verify.mockResolvedValue(authInfo());
    mocks.getGrowthBriefing.mockResolvedValue({
      platform: "xiaohongshu",
      sample_size: 12,
      headline: "Distribution is healthy, but saves lag",
      summary: "Impressions recovered while save rate stayed flat.",
      north_star: { label: "Saves per thousand views", value: "8.4", evidence: "12 real samples" },
      funnel: [],
      priorities: [],
      experiment: null,
      missing_data: [],
      daily_impressions: [{ date: "09-01", impressions: 4200 }],
      funnel_totals: { impressions: 4200, clicks: 260, views: 1800, interactions: 96, followers: 12 }
    });
    const response = await POST(request("tools/call", {
      name: "finfold_get_growth_briefing",
      arguments: { locale: "en", platform: "xiaohongshu" }
    }, { authorization: "Bearer signed-token" }));
    const body = await response.json();

    expect(mocks.getGrowthBriefing).toHaveBeenCalledWith(userId, "en", "xiaohongshu");
    expect(body.result.structuredContent).toMatchObject({
      platform: "xiaohongshu",
      sample_size: 12,
      headline: "Distribution is healthy, but saves lag"
    });
    expect(body.result.content[0].text).toContain("12 real performance samples");
  });

  it("explains when no performance data has been imported yet", async () => {
    mocks.verify.mockResolvedValue(authInfo());
    mocks.getGrowthBriefing.mockResolvedValue({
      platform: null,
      sample_size: 0,
      headline: "",
      summary: "",
      north_star: { label: "", value: "", evidence: "" },
      funnel: [],
      priorities: [],
      experiment: null,
      missing_data: ["Import at least one account snapshot"],
      daily_impressions: [],
      funnel_totals: null
    });
    const response = await POST(request("tools/call", {
      name: "finfold_get_growth_briefing",
      arguments: {}
    }, { authorization: "Bearer signed-token" }));
    const body = await response.json();

    expect(body.result.content[0].text).toContain("No publishing performance data has been imported");
    expect(body.result.structuredContent.missing_data).toContain("Import at least one account snapshot");
  });

  it("returns a tool-level OAuth challenge before any Brand Memory write", async () => {
    const response = await POST(request("tools/call", {
      name: "finfold_update_brand_memory",
      arguments: { brand_name: "Joey Labs" }
    }));
    const body = await response.json();
    expect(body.result.isError).toBe(true);
    expect(body.result._meta["mcp/www_authenticate"][0]).toContain('error="insufficient_scope"');
    expect(mocks.updateBrandMemory).not.toHaveBeenCalled();
  });

  it("does not turn a credit failure into an in-ChatGPT sales prompt", async () => {
    mocks.verify.mockResolvedValue(authInfo());
    mocks.generate.mockRejectedValue(new Error("This Finfold workspace is out of AI Credits for this cycle. Upgrade or top up to continue generating."));
    const response = await POST(request("tools/call", {
      name: "finfold_create_content_kit",
      arguments: { request_id: requestId, brief: "A sufficiently detailed brief for the launch.", platforms: ["linkedin"] }
    }, { authorization: "Bearer signed-token" }));
    const body = await response.json();
    const text = body.result.content[0].text as string;

    expect(text).toBe("Generation is unavailable because this Finfold account has no available AI Credits.");
    expect(text).not.toMatch(/upgrade|top up|buy|pricing/i);
  });

  it("does not expose unexpected backend error details", async () => {
    mocks.verify.mockResolvedValue(authInfo());
    mocks.generate.mockRejectedValue(
      new Error("database host db.internal.example rejected secret service-role-key-123")
    );
    const response = await POST(request("tools/call", {
      name: "finfold_create_content_kit",
      arguments: {
        request_id: requestId,
        brief: "A sufficiently detailed brief for a useful product launch.",
        platforms: ["linkedin"]
      }
    }, { authorization: "Bearer signed-token" }));
    const body = await response.json();
    const text = body.result.content[0].text as string;

    expect(body.result._meta["finfold/error_code"]).toBe("finfold_error");
    expect(text).toBe(
      "Finfold could not complete this request. Please try again. If the problem continues, contact Finfold support."
    );
    expect(text).not.toMatch(/db\.internal|service-role-key|database host/i);
  });

  it("serves a self-contained MCP App card with a restrictive CSP", async () => {
    const response = await POST(request("resources/read", { uri: "ui://finfold/content-kit-v1.html" }));
    const body = await response.json();
    const resource = body.result.contents[0];

    expect(resource.mimeType).toBe("text/html;profile=mcp-app");
    expect(resource.text).toContain("ui/notifications/tool-result");
    expect(resource.text).not.toMatch(/<script[^>]+src=|<link[^>]+href=/i);
    expect(resource._meta.ui.csp).toEqual({ connectDomains: [], resourceDomains: [] });
    expect(resource._meta["openai/widgetCSP"]).toEqual({
      connect_domains: [],
      resource_domains: [],
      redirect_domains: ["https://www.finfold.app"]
    });
    expect(resource._meta["openai/widgetDescription"]).toMatch(/saved Finfold content kit/i);
  });
});
