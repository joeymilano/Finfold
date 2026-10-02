import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { buildSiteVerification } from "@/lib/site-verification";

describe("Baidu acquisition surface", () => {
  it("gives Baiduspider a public-first crawl rule and the canonical sitemap", () => {
    const config = robots();
    const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
    const baidu = rules.find((rule) => rule.userAgent === "Baiduspider");

    expect(config.sitemap).toBe("https://www.finfold.app/sitemap.xml");
    expect(baidu?.allow).toBe("/");
    expect(baidu?.disallow).toEqual(expect.arrayContaining([
      "/api/",
      "/signup",
      "/dashboard",
      "/workbench",
      "/*?*utm_",
      "/*?*_rsc="
    ]));
  });

  it("previews only canonical, parameter-free Finfold URLs without a token", () => {
    const output = execFileSync(process.execPath, [
      join(process.cwd(), "scripts/submit-baidu.mjs"),
      "--dry-run",
      "https://www.finfold.app/",
      "https://www.finfold.app/en",
      "https://www.finfold.app/?utm_source=test",
      "https://finfold.app/",
      "https://example.com/"
    ], { encoding: "utf8" });

    expect(output).toContain("Baidu dry run: 2 canonical URLs");
    expect(output).toContain("https://www.finfold.app/en");
    expect(output).not.toContain("utm_source");
    expect(output).not.toContain("example.com");
  });

  it("documents verification and keeps the submission token server-only", () => {
    const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");

    expect(envExample).toContain("BAIDU_SITE_VERIFICATION=");
    expect(envExample).toContain("BAIDU_SITE_TOKEN=");
    expect(envExample).not.toContain("NEXT_PUBLIC_BAIDU");
    expect(buildSiteVerification({ BAIDU_SITE_VERIFICATION: "verification-code" }))
      .toEqual({ other: { "baidu-site-verification": "verification-code" } });
  });
});
