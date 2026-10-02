// @vitest-environment node
// Explicit opt-in live checks for the public-evidence fetch path. These hit
// real platform pages without credentials, so assertions stay behavioral
// (identity recovery, wall classification) instead of page-content-specific.
import { describe, expect, it } from "vitest";
import {
  collectPublicAccountEvidence,
  resolveEvidenceLevel,
  resolveSocialAccountProfile
} from "@/lib/agent/account-investigation";

describe.skipIf(process.env.ACCOUNT_EVIDENCE_LIVE !== "true")("account public evidence (live)", () => {
  it("recovers the account id from a Xiaohongshu share short link behind the login wall", async () => {
    const shareUrl = process.env.ACCOUNT_EVIDENCE_LIVE_XHS_URL ?? "https://xhslink.cn/o/3QRuDSWEZio";
    const evidence = await collectPublicAccountEvidence(resolveSocialAccountProfile(shareUrl));

    expect(evidence.identifiedAccount?.handle).toMatch(/^[0-9a-f]{16,32}$/i);
    expect(evidence.accountUrl).toContain("xiaohongshu.com/user/profile/");
    expect(evidence.signals.some((signal) => signal.kind === "login_wall")).toBe(true);
    expect(resolveEvidenceLevel(evidence, { analyticsText: "", imageUrls: [] })).toBe("link_only");
  }, 30_000);

  it("reads a public X profile without credentials", async () => {
    const evidence = await collectPublicAccountEvidence(resolveSocialAccountProfile("https://x.com/elonmusk"));
    expect(evidence.captureMethod).toBe("public_web");
    expect(evidence.visibleText).toContain("@elonmusk");
    expect(resolveEvidenceLevel(evidence, { analyticsText: "", imageUrls: [] })).toBe("public_profile");
  }, 30_000);

  it("reads a public LinkedIn profile or reports its authwall without failing", async () => {
    const evidence = await collectPublicAccountEvidence(
      resolveSocialAccountProfile("https://www.linkedin.com/in/williamhgates/")
    );
    expect(evidence.captureMethod).toBe("public_web");
    expect(
      evidence.signals.some((signal) => signal.kind === "profile_visible")
      || evidence.signals.some((signal) => signal.kind === "login_wall")
    ).toBe(true);
    expect(evidence.identifiedAccount?.handle).toBe("williamhgates");
  }, 30_000);
});
