import { beforeEach, describe, expect, it } from "vitest";
import {
  classifyMarketingPath,
  classifyTraffic,
  getAcquisitionPersonProperties,
  getAcquisitionProperties,
  refreshAcquisitionContext
} from "@/lib/acquisition";

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value)
    }
  });
  window.history.replaceState({}, "", "/");
});

describe("content acquisition attribution", () => {
  it("marks explicit QA campaigns without classifying normal visitors as tests", () => {
    expect(classifyTraffic({ utmSource: "codex", utmMedium: "qa", utmCampaign: "posthog_production_validation" })).toBe("qa");
    expect(classifyTraffic({ utmSource: "codex", utmMedium: "referral", utmCampaign: "founder-launch" })).toBe("production");
    expect(classifyTraffic({ utmSource: "google", utmMedium: "organic", utmCampaign: "founder-marketing" })).toBe("production");
  });

  it("classifies localized public acquisition routes without storing arbitrary query data", () => {
    expect(classifyMarketingPath("/en/blog/product-changelog-to-linkedin-post")).toEqual({
      contentType: "blog_post",
      contentSlug: "product-changelog-to-linkedin-post",
      locale: "en"
    });
    expect(classifyMarketingPath("/tools/linkedin-post-generator")).toEqual({
      contentType: "tool",
      contentSlug: "linkedin-post-generator",
      locale: "zh"
    });
    expect(classifyMarketingPath("/en/use-cases/ai-marketing-for-small-business")).toEqual({
      contentType: "use_case",
      contentSlug: "ai-marketing-for-small-business",
      locale: "en"
    });
    expect(classifyMarketingPath("/signup")).toEqual({
      contentType: "other",
      locale: "zh"
    });
  });

  it("keeps a small-business use case as both first and latest content touch through signup", () => {
    window.history.replaceState({}, "", "/en/use-cases/ai-marketing-for-small-business?utm_source=google&utm_medium=organic");
    const landing = refreshAcquisitionContext();

    expect(landing?.first).toMatchObject({
      landingPath: "/en/use-cases/ai-marketing-for-small-business",
      contentType: "use_case",
      contentSlug: "ai-marketing-for-small-business",
      locale: "en",
      utmSource: "google",
      utmMedium: "organic"
    });

    window.history.replaceState({}, "", "/signup");
    const signup = refreshAcquisitionContext();
    expect(signup?.first.contentSlug).toBe("ai-marketing-for-small-business");
    expect(signup?.latest.contentSlug).toBe("ai-marketing-for-small-business");
    expect(getAcquisitionProperties()).toMatchObject({
      traffic_class: "qa",
      is_test_traffic: "true"
    });
  });

  it("keeps production validation traffic marked as QA through signup", () => {
    window.history.replaceState(
      {},
      "",
      "/en/use-cases/ai-marketing-for-small-business?utm_source=codex&utm_medium=qa&utm_campaign=posthog_production_validation"
    );
    refreshAcquisitionContext();
    window.history.replaceState({}, "", "/signup?next=%2Fdashboard");

    expect(getAcquisitionProperties()).toMatchObject({
      first_traffic_class: "qa",
      latest_traffic_class: "qa",
      traffic_class: "qa",
      is_test_traffic: "true"
    });
    expect(getAcquisitionPersonProperties().set).toMatchObject({
      traffic_class: "qa",
      is_test_traffic: "true"
    });
  });

  it("upgrades a legacy stored QA touch that predates traffic classification", () => {
    window.localStorage.setItem("finfold-acquisition-v1", JSON.stringify({
      first: {
        capturedAt: "2026-08-16T00:00:00.000Z",
        landingPath: "/en/use-cases/ai-marketing-for-small-business",
        referrerDomain: "direct",
        locale: "en",
        contentType: "use_case",
        contentSlug: "ai-marketing-for-small-business",
        utmSource: "codex",
        utmMedium: "qa",
        utmCampaign: "posthog_production_validation"
      },
      latest: {
        capturedAt: "2026-08-16T00:00:00.000Z",
        landingPath: "/en/use-cases/ai-marketing-for-small-business",
        referrerDomain: "direct",
        locale: "en",
        contentType: "use_case",
        contentSlug: "ai-marketing-for-small-business",
        utmSource: "codex",
        utmMedium: "qa",
        utmCampaign: "posthog_production_validation"
      }
    }));
    window.history.replaceState({}, "", "/signup");

    expect(getAcquisitionProperties()).toMatchObject({
      traffic_class: "qa",
      is_test_traffic: "true"
    });
  });

  it("preserves first-touch and does not let signup erase the latest content touch", () => {
    window.history.replaceState(
      {},
      "",
      "/en/blog/product-changelog-to-linkedin-post?utm_source=devto&utm_medium=organic_social&utm_campaign=problem_led_seo_2026q3&email=do-not-store"
    );
    const first = refreshAcquisitionContext();

    expect(first?.first).toMatchObject({
      landingPath: "/en/blog/product-changelog-to-linkedin-post",
      contentType: "blog_post",
      contentSlug: "product-changelog-to-linkedin-post",
      locale: "en",
      utmSource: "devto",
      utmMedium: "organic_social",
      utmCampaign: "problem_led_seo_2026q3"
    });

    window.history.replaceState({}, "", "/signup");
    const afterSignup = refreshAcquisitionContext();
    expect(afterSignup?.latest.contentSlug).toBe("product-changelog-to-linkedin-post");

    window.history.replaceState(
      {},
      "",
      "/tools/linkedin-post-generator?utm_source=linkedin&utm_content=release_post"
    );
    const afterTool = refreshAcquisitionContext();
    expect(afterTool?.first.utmSource).toBe("devto");
    expect(afterTool?.latest).toMatchObject({
      contentType: "tool",
      contentSlug: "linkedin-post-generator",
      utmSource: "linkedin",
      utmContent: "release_post"
    });

    const properties = getAcquisitionProperties();
    expect(properties).toMatchObject({
      first_content_slug: "product-changelog-to-linkedin-post",
      first_utm_source: "devto",
      latest_content_slug: "linkedin-post-generator",
      latest_utm_source: "linkedin"
    });
    expect(JSON.stringify(properties)).not.toContain("do-not-store");
    expect(JSON.stringify(properties)).not.toContain("email");
  });

  it("splits immutable first-touch and mutable latest-touch person properties", () => {
    window.history.replaceState({}, "", "/blog/product-hunt-maker-comment-guide?utm_source=linkedin");
    const person = getAcquisitionPersonProperties();

    expect(person.setOnce.first_content_slug).toBe("product-hunt-maker-comment-guide");
    expect(person.setOnce.first_utm_source).toBe("linkedin");
    expect(person.set.latest_content_slug).toBe("product-hunt-maker-comment-guide");
    expect(Object.keys(person.setOnce).every((key) => key.startsWith("first_"))).toBe(true);
    expect(
      Object.keys(person.set).every(
        (key) => key.startsWith("latest_") || key === "traffic_class" || key === "is_test_traffic"
      )
    ).toBe(true);
  });
});
