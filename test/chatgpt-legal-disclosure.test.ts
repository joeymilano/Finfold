import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brand } from "@/lib/brand";
import { privacyPolicy, termsOfService } from "@/lib/legal";

describe("ChatGPT integration disclosures", () => {
  it("explains connected-assistant data handling and revocation in both languages", () => {
    const privacy = JSON.stringify(privacyPolicy);
    const terms = JSON.stringify(termsOfService);
    expect(privacy).toContain("Connected assistants and integrations");
    expect(privacy).toContain("can be revoked at any time in Settings");
    expect(privacy).toContain("authentication provider may share your account email address");
    expect(privacy).toContain("public assistant tools do not return your email address");
    expect(privacy).toContain("已连接的智能助手与集成");
    expect(terms).toContain("does not grant the assistant permission to publish content");
    expect(terms).toContain("不会授予智能助手发布内容");
  });

  it("ships a public support URL and the complete reviewer test matrix", () => {
    const support = readFileSync(join(process.cwd(), "app/support/page.tsx"), "utf8");
    const submission = readFileSync(
      join(process.cwd(), "docs/chatgpt-app-submission-copy.md"),
      "utf8"
    );

    expect(brand.legal.contactEmail).toBe("support@finfold.app");
    expect(support).toContain("brand.legal.contactEmail");
    expect(support).toContain("Never email passwords, API keys, OAuth tokens");
    expect(submission.match(/^### [1-6]\. /gm)).toHaveLength(6);
    expect(submission.match(/^### N[1-3]\. /gm)).toHaveLength(3);
    expect(submission.match(/^\*\*Expected result shape\*\*$/gm)).toHaveLength(6);
    expect(submission).toContain("https://www.finfold.app/support");
    expect(submission).toContain("## Initial release notes");
  });
});
