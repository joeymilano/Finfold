import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("PostHog acquisition-to-signup contract", () => {
  it("routes the key landing conversion surfaces through the canonical CTA event", () => {
    const landing = readFileSync(join(process.cwd(), "components/landing/LandingPage.tsx"), "utf8");

    expect(landing).toContain('ctaId="landing_hero_first_task"');
    expect(landing).toContain('ctaId="landing_account_health"');
    expect(landing).toContain('ctaId="landing_closing_primary"');
    expect(landing).not.toContain('captureEvent("growth_audit_entry_clicked"');
    expect(landing).not.toContain('captureEvent("account_health_landing_cta_clicked"');
  });

  it("keeps the documented production funnel aligned with emitted event names", () => {
    const runbook = readFileSync(join(process.cwd(), "docs/posthog-signup-funnel.md"), "utf8");
    for (const event of [
      "landing_view",
      "marketing_cta_clicked",
      "signup_page_viewed",
      "signup_started",
      "signup_completed",
      "signup_destination_reached"
    ]) {
      expect(runbook).toContain(event);
    }
    expect(runbook).toContain("traffic_class = production");
    expect(runbook).toContain("destination = signup");
  });

  it("includes every public index page in the landing step", () => {
    const files = [
      ["components/tools/ToolsIndexView.tsx", "tools_index"],
      ["components/blog/BlogIndexView.tsx", "blog_index"],
      ["components/use-cases/UseCaseIndexView.tsx", "use_cases_index"]
    ] as const;

    for (const [file, contentType] of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toContain(`contentType="${contentType}"`);
    }
  });

  it("does not resend the full sitemap after routine application deploys", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.postdeploy).toContain("--main --deployed");
    expect(packageJson.scripts?.postdeploy).not.toContain("seo:indexnow");
    expect(packageJson.scripts?.["seo:indexnow"]).toBe("node scripts/submit-indexnow.mjs");
  });
});
