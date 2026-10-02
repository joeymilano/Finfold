import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brand } from "@/lib/brand";
import { privacyPolicy } from "@/lib/legal";

describe("Chrome Store release configuration", () => {
  const config = readFileSync("wrangler.toml", "utf8");
  it("adds only the assigned store origin while preserving the pilot", () => {
    const origins = config.match(/^FINFOLD_EXTENSION_ORIGINS = "([^"]+)"/m)?.[1].split(",");
    expect(origins).toEqual([
      "chrome-extension://gebbcemokglolnbocggbefmkjkfkcfhe",
      "chrome-extension://lgkoejhkpfpbpebdlbgojngohgghmgpg"
    ]);
  });
  it("keeps anonymous generation closed", () => {
    expect(config).toMatch(/^FINFOLD_EXTENSION_ANONYMOUS_ENABLED = "false"/m);
  });
  it("keeps support copy consistent with the login-only store build", () => {
    const support = readFileSync("app/extension/support/page.tsx", "utf8");
    expect(support).toContain("Anonymous generation is not offered");
    expect(support).toContain("3 Credits for one platform or 24 Credits");
    expect(support).toContain("does not include reply drafts or automatic comments");
  });
  it("discloses the actual direct processor chain and login-only release", () => {
    expect(brand.legal.aiProviders.en).toContain("Zhipu AI");
    expect(brand.legal.aiProviders.en).toContain("Alibaba Cloud DashScope");
    expect(brand.legal.aiProviders.en).toContain("DeepSeek");
    const text = privacyPolicy.sections.flatMap(section => section.paragraphs.map(p => p.en)).join("\n");
    expect(text).toContain("anonymous generation is disabled");
    expect(text).toContain("Zhipu AI/GLM");
    expect(text).toContain("not persistent Letta agents");
    expect(text).toContain("Credits transaction records");
  });
});
