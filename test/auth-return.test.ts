import { describe, expect, it } from "vitest";
import {
  buildAuthHref,
  getPlanIntentFromReturnTo,
  isOAuthConsentReturnTo,
  isValidOAuthAuthorizationId,
  sanitizeInternalReturnTo
} from "@/lib/auth-return";

describe("post-auth return paths", () => {
  it("preserves a selected Starter checkout inside Finfold", () => {
    const target = "/billing?plan=starter";
    expect(sanitizeInternalReturnTo(target)).toBe(target);
    expect(buildAuthHref("/login", target)).toBe("/login?next=%2Fbilling%3Fplan%3Dstarter");
    expect(getPlanIntentFromReturnTo(target)).toBe("starter");
  });

  it("rejects external, protocol-relative, API, and recursive auth targets", () => {
    expect(sanitizeInternalReturnTo("https://evil.example/steal")).toBe("/dashboard");
    expect(sanitizeInternalReturnTo("//evil.example/steal")).toBe("/dashboard");
    expect(sanitizeInternalReturnTo("/api/auth/logout")).toBe("/dashboard");
    expect(sanitizeInternalReturnTo("/login?next=/billing")).toBe("/dashboard");
  });

  it("ignores unknown plan values while keeping the safe product path", () => {
    expect(sanitizeInternalReturnTo("/billing?plan=enterprise-secret")).toBe("/billing?plan=enterprise-secret");
    expect(getPlanIntentFromReturnTo("/billing?plan=enterprise-secret")).toBeNull();
  });

  it("recognizes only a valid OAuth consent return", () => {
    expect(isOAuthConsentReturnTo(
      "/oauth/consent?authorization_id=12345678-1234-4234-8234-123456789012"
    )).toBe(true);
    expect(isOAuthConsentReturnTo(
      "/oauth/consent?authorization_id=m72ihmk2fvqawcxhp7boir5xjoa5ivbs"
    )).toBe(true);
    expect(isOAuthConsentReturnTo("/oauth/consent?authorization_id=short")).toBe(false);
    expect(isOAuthConsentReturnTo("/dashboard?authorization_id=12345678-1234-4234-8234-123456789012")).toBe(false);
  });

  it("accepts opaque Supabase IDs but rejects path and query delimiters", () => {
    expect(isValidOAuthAuthorizationId("m72ihmk2fvqawcxhp7boir5xjoa5ivbs")).toBe(true);
    expect(isValidOAuthAuthorizationId("oauth_authorization-id_1234")).toBe(true);
    expect(isValidOAuthAuthorizationId("oauth/authorization-id-1234")).toBe(false);
    expect(isValidOAuthAuthorizationId("oauth?authorization=id-1234")).toBe(false);
  });
});
