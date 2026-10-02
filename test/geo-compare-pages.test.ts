import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { comparePages } from "@/lib/compare-pages";

describe("GEO comparison and learn pages", () => {
  it("ships three comparison pages with quotable direct answers", () => {
    expect(comparePages.map((page) => page.slug)).toEqual(["chatgpt", "jasper", "multi-channel"]);

    for (const page of comparePages) {
      const words = page.directAnswer.split(/\s+/).filter(Boolean).length;
      expect(words, `${page.slug} directAnswer word count`).toBeGreaterThanOrEqual(40);
      expect(words, `${page.slug} directAnswer word count`).toBeLessThanOrEqual(60);
      expect(page.rows.length, `${page.slug} difference rows`).toBeGreaterThanOrEqual(6);
      expect(page.faqs, `${page.slug} faq count`).toHaveLength(3);
      // Copy rules: no periods in titles or headings.
      expect(page.title).not.toMatch(/[.。]/);
      expect(page.h1).not.toMatch(/[.。]/);
    }
  });

  it("registers comparison and learn pages in the sitemap", () => {
    const urls = new Set(sitemap().map((entry) => entry.url));

    for (const page of comparePages) {
      expect(urls.has(`https://www.finfold.app/en/compare/${page.slug}`)).toBe(true);
    }
    expect(urls.has("https://www.finfold.app/en/learn/what-is-an-ai-marketing-agent")).toBe(true);
  });

  it("keeps llms.txt listing comparisons and the learn page", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const body = await GET().text();

    expect(body).toContain("## Comparisons");
    expect(body).toContain("## Learn");
    for (const page of comparePages) {
      expect(body).toContain(`/en/compare/${page.slug}`);
    }
    expect(body).toContain("/en/learn/what-is-an-ai-marketing-agent");
  });

  it("welcomes PerplexityBot explicitly in robots.txt", async () => {
    const robots = await import("@/app/robots");
    const rules = robots.default().rules;
    const ruleList = Array.isArray(rules) ? rules : [rules];
    const perplexity = ruleList.find((rule) => rule.userAgent === "PerplexityBot");

    expect(perplexity).toBeDefined();
    expect(perplexity?.allow).toContain("/");
    expect(perplexity?.disallow).toContain("/api/");
  });
});
