import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import sitemap from "@/app/sitemap";
import { GET as getLlmsTxt } from "@/app/llms.txt/route";
import { blogPosts } from "@/lib/blog-posts";
import { buildUseCaseSchema } from "@/lib/use-case-schema";
import { useCasePages } from "@/lib/use-case-pages";

describe("Bing acquisition surface", () => {
  it("publishes reciprocal localized URLs for every high-intent use case", () => {
    const entries = sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));

    for (const page of useCasePages) {
      const zhUrl = `https://www.finfold.app/use-cases/${page.slug}`;
      const enUrl = `https://www.finfold.app/en/use-cases/${page.slug}`;
      expect(byUrl.has(zhUrl)).toBe(true);
      expect(byUrl.has(enUrl)).toBe(true);
      expect(byUrl.get(enUrl)?.alternates?.languages).toMatchObject({
        "zh-CN": zhUrl,
        en: enUrl,
        "x-default": zhUrl
      });
      expect(byUrl.get(enUrl)?.lastModified).toEqual(new Date(`${page.updatedAt}T00:00:00.000Z`));
    }
  });

  it("adds useful WebPage, breadcrumb, and FAQ structured data", () => {
    const graph = buildUseCaseSchema(useCasePages[0], "en")["@graph"];
    expect(graph.map((node) => node["@type"])).toEqual(["WebPage", "BreadcrumbList", "FAQPage"]);
    expect(graph[0]).toMatchObject({
      name: "AI Marketing for Founders Without a Content Team | Finfold",
      description: expect.stringContaining("LinkedIn, X, Product Hunt"),
      inLanguage: "en",
      dateModified: "2026-08-12",
      primaryImageOfPage: {
        url: "https://www.finfold.app/use-cases/founder-midnight-launch.webp"
      }
    });
    expect(graph[2]).toMatchObject({
      "@type": "FAQPage",
      mainEntity: expect.arrayContaining([
        expect.objectContaining({ name: "Can AI marketing replace product positioning?" })
      ])
    });
  });

  it("adds the small-business WebPage, breadcrumb, and five grounded FAQs", () => {
    const page = useCasePages.find((candidate) => candidate.slug === "ai-marketing-for-small-business");
    const graph = buildUseCaseSchema(page!, "en")["@graph"];

    expect(graph.map((node) => node["@type"])).toEqual(["WebPage", "BreadcrumbList", "FAQPage"]);
    expect(graph[0]).toMatchObject({
      name: "AI Marketing for Small Business | Finfold",
      url: "https://www.finfold.app/en/use-cases/ai-marketing-for-small-business",
      inLanguage: "en",
      dateModified: "2026-08-16"
    });
    expect(graph[1].itemListElement).toHaveLength(3);
    expect(graph[2].mainEntity).toHaveLength(5);
    expect(JSON.stringify(graph)).not.toContain("AggregateRating");
  });

  it("publishes every new cluster entry in llms.txt", async () => {
    const body = await (await getLlmsTxt()).text();
    expect(body).toContain("AI Marketing for Founders Without a Content Team | Finfold");
    expect(body).toContain("https://www.finfold.app/en/use-cases/ai-marketing-for-founders");
    expect(body).toContain("AI Marketing for Small Business | Finfold");
    expect(body).toContain("https://www.finfold.app/en/use-cases/ai-marketing-for-small-business");
    for (const post of blogPosts) {
      expect(body).toContain(post.seoTitleEn ?? post.titleEn);
      expect(body).toContain(`https://www.finfold.app/en/blog/${post.slug}`);
    }
  });

  it("keeps IndexNow credentials env-driven and out of the repository", () => {
    const script = readFileSync(join(process.cwd(), "scripts/submit-indexnow.mjs"), "utf8");
    expect(script).toContain("process.env.INDEXNOW_KEY");
    expect(script).not.toMatch(/const INDEXNOW_KEY = "[a-f0-9]{32}"/);
    const publicFiles = readdirSync(join(process.cwd(), "public"));
    expect(publicFiles.filter((name) => /^[a-f0-9]{32}\.txt$/.test(name))).toEqual([]);
  });
});
