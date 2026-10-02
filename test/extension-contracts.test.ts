import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { authenticatedActionRequestSchema, extensionPageContextSchema } from "@/lib/extension/contracts";
import { isAllowedOauthRedirect, oauthAuthorizeSchema, oauthTokenSchema } from "@/lib/extension/oauth";
import { extensionActionCost } from "@/lib/extension/service";

const page = {
  url: "https://example.com/article",
  title: "A useful article",
  siteName: "Example",
  description: "",
  language: "en",
  text: "Source text that is long enough to satisfy the extraction contract.",
  selectionUsed: false
};

describe("Chrome extension request and billing contracts", () => {
  it("accepts exactly one platform or the complete four-platform pack", () => {
    const base = {
      requestId: "11111111-1111-4111-8111-111111111111",
      action: "repurpose" as const,
      language: "auto" as const,
      page
    };
    expect(authenticatedActionRequestSchema.safeParse({ ...base, platforms: ["x"] }).success).toBe(true);
    expect(authenticatedActionRequestSchema.safeParse({
      ...base,
      platforms: ["x", "linkedin", "xiaohongshu", "reddit"]
    }).success).toBe(true);
    expect(authenticatedActionRequestSchema.safeParse({ ...base, platforms: ["x", "reddit"] }).success).toBe(false);
    expect(authenticatedActionRequestSchema.safeParse({ ...base, platforms: ["x", "x", "x", "x"] }).success).toBe(false);
  });

  it("enforces the 8,000-character source boundary", () => {
    expect(extensionPageContextSchema.safeParse({ ...page, text: "a".repeat(8_000) }).success).toBe(true);
    expect(extensionPageContextSchema.safeParse({ ...page, text: "a".repeat(8_001) }).success).toBe(false);
  });

  it("charges the existing 3-Credit single action and 24-Credit full kit", () => {
    expect(extensionActionCost(1)).toBe(3);
    expect(extensionActionCost(4)).toBe(24);
  });
});

describe("Chrome extension OAuth input boundaries", () => {
  const extensionId = "a".repeat(32);
  beforeEach(() => vi.stubEnv("FINFOLD_EXTENSION_ORIGINS", `chrome-extension://${extensionId}`));
  afterEach(() => vi.unstubAllEnvs());
  const redirectUri = `https://${extensionId}.chromiumapp.org/finfold`;
  const codeChallenge = "b".repeat(43);
  const state = "c".repeat(32);

  it("accepts only the dedicated chromiumapp callback path", () => {
    expect(isAllowedOauthRedirect(redirectUri)).toBe(true);
    expect(isAllowedOauthRedirect("https://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.chromiumapp.org/finfold")).toBe(false);
    expect(isAllowedOauthRedirect(`https://${extensionId}.chromiumapp.org/other`)).toBe(false);
    expect(isAllowedOauthRedirect("https://www.finfold.app/extension/callback")).toBe(false);
    expect(oauthAuthorizeSchema.safeParse({ redirectUri, codeChallenge, state }).success).toBe(true);
  });

  it("rejects malformed PKCE, state, and token grants", () => {
    expect(oauthAuthorizeSchema.safeParse({ redirectUri, codeChallenge: "short", state }).success).toBe(false);
    expect(oauthAuthorizeSchema.safeParse({ redirectUri, codeChallenge, state: "short" }).success).toBe(false);
    expect(oauthTokenSchema.safeParse({ grantType: "refresh_token", refreshToken: "not-a-token" }).success).toBe(false);
  });
});
