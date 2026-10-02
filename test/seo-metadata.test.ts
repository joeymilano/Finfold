import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { metadata as zhHomeMetadata } from "@/app/page";
import { metadata as enHomeMetadata } from "@/app/en/page";
import { metadata as zhToolsMetadata } from "@/app/tools/page";
import { metadata as enToolsMetadata } from "@/app/en/tools/page";
import { metadata as zhBlogMetadata } from "@/app/blog/page";
import { metadata as enBlogMetadata } from "@/app/en/blog/page";
import { metadata as zhUseCasesMetadata } from "@/app/use-cases/page";
import { metadata as enUseCasesMetadata } from "@/app/en/use-cases/page";
import { metadata as forAgentsMetadata } from "@/app/for-agents/page";
import { metadata as privacyMetadata } from "@/app/privacy/page";
import { metadata as termsMetadata } from "@/app/terms/page";
import { metadata as refundMetadata } from "@/app/refund/page";
import { brand } from "@/lib/brand";
import { getBlogVisual } from "@/lib/blog-visuals";
import {
  archivedBlogPosts,
  blogPosts,
  founderMarketingBlogSlugs,
  getRelatedBlogPosts,
  landingFeaturedBlogSlugs
} from "@/lib/blog-posts";
import { founderMarketingToolSlugs, getRelatedToolPages, toolPages } from "@/lib/tool-pages";
import { useCasePages } from "@/lib/use-case-pages";
import { buildArticleSchema, buildFaqSchema, buildSoftwareApplicationSchema, buildToolSchema, buildToolsCollectionSchema, buildWebSiteSchema } from "@/lib/structured-data";

describe("public SEO surface", () => {
  it("keeps every public title and description useful in Bing snippets", () => {
    const staticMetadata = [
      zhHomeMetadata,
      enHomeMetadata,
      zhToolsMetadata,
      enToolsMetadata,
      zhBlogMetadata,
      enBlogMetadata,
      zhUseCasesMetadata,
      enUseCasesMetadata,
      forAgentsMetadata,
      privacyMetadata,
      termsMetadata,
      refundMetadata
    ];
    const dynamicMetadata = [
      ...toolPages.flatMap((tool) => [
        { title: tool.searchTitleZh, description: tool.searchDescriptionZh },
        { title: tool.searchTitleEn, description: tool.searchDescriptionEn }
      ]),
      ...blogPosts.flatMap((post) => [
        {
          title: post.seoTitleZh ?? post.titleZh,
          description: post.seoDescriptionZh ?? post.descriptionZh
        },
        {
          title: post.seoTitleEn ?? post.titleEn,
          description: post.seoDescriptionEn ?? post.descriptionEn
        }
      ]),
      ...useCasePages.flatMap((page) => [
        {
          title: page.searchTitleZh ?? page.titleZh,
          description: page.searchDescriptionZh ?? page.descriptionZh
        },
        {
          title: page.searchTitleEn ?? page.titleEn,
          description: page.searchDescriptionEn ?? page.descriptionEn
        }
      ])
    ];

    const issues: string[] = [];
    for (const entry of [...staticMetadata, ...dynamicMetadata]) {
      const title = String(entry.title ?? "");
      const description = String(entry.description ?? "");
      if (title.length < 25 || title.length > 65) {
        issues.push(`title ${title.length}: ${title}`);
      }
      if (description.length < 70 || description.length > 165) {
        issues.push(`description ${description.length} for: ${title}`);
      }
    }
    expect(issues).toEqual([]);
  });

  it("matches the current high-impression zero-click search opportunities", () => {
    const firstEyes = blogPosts.find((post) => post.slug === "reddit-first-customers-manual-outreach");
    const xiaohongshu = toolPages.find((tool) => tool.slug === "xiaohongshu-generator");

    expect(firstEyes?.seoTitleEn).toContain("FirstEyes AI");
    expect(firstEyes?.seoDescriptionEn).toContain("FirstEyes AI");
    expect(xiaohongshu?.searchTitleZh).toContain("小红书标题生成器");
  });

  it("keeps authenticated product routes out of the sitemap", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain("https://www.finfold.app/support");
    expect(urls).not.toContain("https://www.finfold.app/workbench");
    expect(urls).not.toContain("https://www.finfold.app/billing");
    expect(urls).not.toContain("https://www.finfold.app/dashboard");
  });

  it("publishes reciprocal Chinese and English URLs for every tool, playbook, and use case", () => {
    const entries = sitemap();
    const urls = new Set(entries.map((entry) => entry.url));

    for (const tool of toolPages) {
      expect(urls.has(`https://www.finfold.app/tools/${tool.slug}`)).toBe(true);
      expect(urls.has(`https://www.finfold.app/en/tools/${tool.slug}`)).toBe(true);
    }

    for (const post of blogPosts) {
      expect(urls.has(`https://www.finfold.app/blog/${post.slug}`)).toBe(true);
      expect(urls.has(`https://www.finfold.app/en/blog/${post.slug}`)).toBe(true);
    }
    for (const post of archivedBlogPosts) {
      expect(urls.has(`https://www.finfold.app/blog/${post.slug}`)).toBe(false);
      expect(urls.has(`https://www.finfold.app/en/blog/${post.slug}`)).toBe(false);
    }

    for (const useCase of useCasePages) {
      expect(urls.has("https://www.finfold.app/use-cases/" + useCase.slug)).toBe(true);
      expect(urls.has("https://www.finfold.app/en/use-cases/" + useCase.slug)).toBe(true);
    }

    const home = entries.find((entry) => entry.url === "https://www.finfold.app/");
    expect(home?.alternates?.languages).toEqual({
      "zh-CN": "https://www.finfold.app/",
      en: "https://www.finfold.app/en",
      "x-default": "https://www.finfold.app/"
    });

    expect(urls.has("https://www.finfold.app/tools")).toBe(true);
    expect(urls.has("https://www.finfold.app/en/tools")).toBe(true);
  });

  it("keeps every growth article grounded in a story, a point of view, and a runnable experiment", () => {
    for (const post of blogPosts) {
      expect(post.introZh.split("\n\n").length).toBeGreaterThanOrEqual(2);
      expect(post.sectionsZh.length).toBeGreaterThanOrEqual(4);
      expect(post.sectionsZh.every((section) => section.body.length >= 80)).toBe(true);
      expect(post.experimentsZh).toHaveLength(3);
      expect(post.readingMinutes).toBeGreaterThanOrEqual(5);
      expect(post.authorEn).toBe("Finfold Editorial");
      expect(post.disclosureZh.length).toBeGreaterThan(30);
      expect(post.disclosureEn.length).toBeGreaterThan(30);
    }

    expect(existsSync(join(process.cwd(), "public/editorial/growth-field-notes.webp"))).toBe(true);
    expect(blogPosts.map((post) => post.slug)).toEqual([
      "reddit-shadowban-recovery-cases",
      "reddit-growth-vote-manipulation-risk",
      "reddit-first-customers-manual-outreach",
      "reddit-post-patterns-popsy-ai",
      "validate-demand-before-building",
      "content-compounding-founder-system",
      "seo-new-keyword-game-case-study",
      "geo-citation-recommendation-experiment",
      "xiaohongshu-plus-size-fashion-positioning",
      "xiaohongshu-founder-livestream-case-study"
    ]);
    expect(archivedBlogPosts).toHaveLength(10);
  });

  it("uses real content dates for public indexes and tool pages", () => {
    const entries = new Map(sitemap().map((entry) => [entry.url, entry]));

    expect(entries.get("https://www.finfold.app/")?.lastModified).toEqual(
      new Date("2026-08-30T00:00:00.000Z")
    );
    expect(entries.get("https://www.finfold.app/blog")?.lastModified).toEqual(
      new Date("2026-08-24T00:00:00.000Z")
    );
    for (const tool of toolPages) {
      expect(entries.get("https://www.finfold.app/tools/" + tool.slug)?.lastModified).toEqual(
        new Date(tool.updatedAt + "T00:00:00.000Z")
      );
    }
  });

  it("gives every tool and use case page a quotable direct-answer opening for AI search", () => {
    const wordCount = (text: string) => text.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g)?.length ?? 0;

    for (const tool of toolPages) {
      expect(wordCount(tool.directAnswerEn)).toBeGreaterThanOrEqual(35);
      expect(wordCount(tool.directAnswerEn)).toBeLessThanOrEqual(65);
      expect(tool.directAnswerZh.length).toBeGreaterThanOrEqual(50);
    }
    for (const useCase of useCasePages) {
      expect(wordCount(useCase.directAnswerEn)).toBeGreaterThanOrEqual(35);
      expect(wordCount(useCase.directAnswerEn)).toBeLessThanOrEqual(65);
      expect(useCase.directAnswerEn).toContain("Finfold");
      expect(useCase.directAnswerZh).toContain("Finfold智能体");
    }
  });

  it("keeps every use case grounded in a human composite story and a real image asset", () => {
    for (const useCase of useCasePages) {
      expect(useCase.introZh.split("\n\n")).toHaveLength(2);
      expect(useCase.sceneLabelZh).toMatch(/\d{1,2}:\d{2}/);
      expect(useCase.quoteZh).toMatch(/^“.+”$/);
      expect(useCase.disclosureZh).toContain("复合场景");
      expect(useCase.disclosureZh).toContain("不对应某位真实客户");
      expect(existsSync(join(process.cwd(), "public", useCase.image))).toBe(true);
    }

    const smallBusinessImage = readFileSync(
      join(process.cwd(), "public/use-cases/small-business-closing-review.webp")
    );
    expect(smallBusinessImage.subarray(12, 16).toString("ascii")).toBe("VP8 ");
    expect(smallBusinessImage.readUInt16LE(26) & 0x3fff).toBe(1600);
    expect(smallBusinessImage.readUInt16LE(28) & 0x3fff).toBe(1000);
  });

  it("positions the homepage on the AI marketing employee and assigns repurposing to its own page", () => {
    expect(enHomeMetadata.title).toBe("Your AI Marketing Employee — Growth, Run End to End | Finfold");
    expect(enHomeMetadata.description).toContain("reviewable growth missions");
    expect(String(enHomeMetadata.title).toLowerCase()).not.toContain("repurposing");
    expect(zhHomeMetadata.title).toBe("AI 增长运营员工｜替你自动经营增长 | Finfold");

    const landingView = readFileSync(join(process.cwd(), "components/landing/LandingPage.tsx"), "utf8");
    expect(landingView).toContain('titleA: "它盯住你的增长"');
    expect(landingView).toContain('titleEm: "每一步都经你确认"');
    expect(landingView).toContain('titleA: "It watches your growth."');
    expect(landingView).toContain('titleEm: "You approve every step."');
    expect(landingView).toContain('href={GROWTH_AUDIT_ENTRY_HREF}');
    expect(landingView).toContain('eyebrow: "ONE CAPABILITY OF THE MARKETING AGENT"');

    const repurposing = useCasePages.find((page) => page.slug === "content-repurposing-for-solopreneurs");
    expect(repurposing?.searchTitleEn).toBe("AI Content Repurposing Workflow for Solopreneurs | Finfold");
    expect(repurposing?.heroEn.toLowerCase()).toContain("ai content repurposing workflow");
    expect(repurposing?.searchGuide?.definitionBodyEn.toLowerCase()).toContain("content repurposing");
    expect(repurposing?.faqs).toHaveLength(5);
  });

  it("publishes a bounded small-business pillar with five FAQs and no growth guarantee", () => {
    const smallBusiness = useCasePages.find((page) => page.slug === "ai-marketing-for-small-business");
    const copy = JSON.stringify(smallBusiness);

    expect(smallBusiness?.heroEn).toBe(
      "A reviewable AI marketing agent for small businesses without a content team."
    );
    expect(smallBusiness?.searchTitleEn).toContain("AI Marketing for Small Business");
    expect(smallBusiness?.searchGuide?.principles).toHaveLength(4);
    expect(smallBusiness?.faqs).toHaveLength(5);
    expect(smallBusiness?.updatedAt).toBe("2026-08-16");
    expect(copy).toContain("unattended");
    expect(copy).toContain("cannot guarantee");
    expect(copy).not.toContain("AggregateRating");
  });

  it("targets the proven founder query with specific, defensible search copy", () => {
    const founder = useCasePages.find((page) => page.slug === "ai-marketing-for-founders");

    expect(founder?.searchTitleEn).toContain("AI Marketing for Founders");
    expect(founder?.searchTitleEn?.length).toBeLessThanOrEqual(60);
    expect(founder?.searchDescriptionEn).toContain("Product Hunt");
    expect(founder?.searchDescriptionEn?.length).toBeGreaterThan(120);
    expect(founder?.eyebrowEn.toLowerCase()).toContain("ai marketing for founders");
    expect(founder?.heroEn.toLowerCase()).toContain("ai marketing for founders");
    expect(founder?.searchGuide?.principles).toHaveLength(4);
    expect(founder?.searchGuide?.poorFitEn).toContain(
      "More posts are expected to guarantee reach or revenue"
    );
    expect(founder?.faqs).toHaveLength(5);

    const englishPillarCopy = JSON.stringify({
      searchTitle: founder?.searchTitleEn,
      searchDescription: founder?.searchDescriptionEn,
      pageTitle: founder?.titleEn,
      pageDescription: founder?.descriptionEn,
      scene: founder?.sceneLabelEn,
      hero: founder?.heroEn,
      intro: founder?.introEn,
      quote: founder?.quoteEn,
      input: [founder?.inputLabelEn, founder?.inputExampleEn],
      output: [founder?.outputLabelEn, founder?.outputsEn],
      problems: founder?.problemsEn,
      steps: founder?.steps.map((step) => [step.titleEn, step.bodyEn]),
      outcomes: founder?.outcomesEn,
      guide: founder?.searchGuide,
      faqs: founder?.faqs.map((faq) => [faq.questionEn, faq.answerEn])
    });
    expect(englishPillarCopy.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g)?.length).toBeGreaterThan(1000);
  });

  it("builds intentional internal paths into the founder guide and between field notes", () => {
    expect([...founderMarketingToolSlugs]).toEqual(expect.arrayContaining([
      "product-hunt-launch-copy",
      "linkedin-post-generator",
      "reddit-post-generator"
    ]));
    expect([...founderMarketingBlogSlugs]).toEqual(expect.arrayContaining([
      "content-compounding-founder-system",
      "validate-demand-before-building",
      "reddit-post-patterns-popsy-ai"
    ]));

    for (const post of blogPosts) {
      const related = getRelatedBlogPosts(post.slug);
      expect(related).toHaveLength(3);
      expect(new Set(related.map((candidate) => candidate.slug)).size).toBe(3);
      expect(related.map((candidate) => candidate.slug)).not.toContain(post.slug);
    }

    const blogView = readFileSync(join(process.cwd(), "components/blog/BlogPostView.tsx"), "utf8");
    const toolView = readFileSync(join(process.cwd(), "components/tools/ToolPage.tsx"), "utf8");
    expect(blogView).toContain("/use-cases/ai-marketing-for-founders");
    expect(blogView).toContain("/use-cases/ai-marketing-for-small-business");
    expect(blogView).toContain("/use-cases/content-repurposing-for-solopreneurs");
    expect(blogView).toContain("/tools/twitter-thread-generator");
    expect(blogView).toContain("/tools/reddit-post-generator");
    expect(toolView).toContain("/use-cases/ai-marketing-for-founders");
  });

  it("features the three core growth themes on the homepage", () => {
    expect(landingFeaturedBlogSlugs).toEqual([
      "content-compounding-founder-system",
      "reddit-growth-vote-manipulation-risk",
      "validate-demand-before-building"
    ]);
  });

  it("describes every public case as an Article with an editorial author and real dates", () => {
    for (const slug of [
      "reddit-shadowban-recovery-cases",
      "reddit-growth-vote-manipulation-risk",
      "reddit-first-customers-manual-outreach",
      "reddit-post-patterns-popsy-ai",
      "validate-demand-before-building",
      "content-compounding-founder-system"
    ]) {
      const post = blogPosts.find((candidate) => candidate.slug === slug);
      expect(post).toBeTruthy();
      const graph = buildArticleSchema(post!, "en")["@graph"];
      expect(graph.map((node) => node["@type"])).toEqual(["Article", "BreadcrumbList"]);
      expect(graph[0]).toMatchObject({
        datePublished: "2026-08-19",
        dateModified: post!.updatedAt,
        inLanguage: "en",
        mainEntityOfPage: "https://www.finfold.app/en/blog/" + slug,
        author: {
          "@type": "Organization",
          name: "Finfold Editorial"
        }
      });
      expect(JSON.stringify(graph)).not.toContain("AggregateRating");
    }
  });

  it("publishes the six bilingual growth cases with traceable firsthand evidence", () => {
    const caseSlugs = [
      "reddit-shadowban-recovery-cases",
      "reddit-growth-vote-manipulation-risk",
      "reddit-first-customers-manual-outreach",
      "reddit-post-patterns-popsy-ai",
      "validate-demand-before-building",
      "content-compounding-founder-system"
    ];

    for (const slug of caseSlugs) {
      const post = blogPosts.find((candidate) => candidate.slug === slug);
      expect(post, slug).toBeTruthy();
      expect(post?.publishedAt).toBe("2026-08-19");
      expect(post?.sectionsZh.length).toBeGreaterThanOrEqual(4);
      expect(post?.sectionsEn.length).toBeGreaterThanOrEqual(4);
      expect(post?.caseStudies?.length).toBeGreaterThanOrEqual(2);
      expect(post?.caseStudies?.every((item) => item.actionsZh.length >= 4)).toBe(true);
      expect(post?.caseStudies?.every((item) => item.actionsEn.length >= 4)).toBe(true);
      expect(post?.caseStudies?.every((item) => item.resultZh && item.failureZh && item.sourceUrl)).toBe(true);
      expect(post?.sources?.length).toBeGreaterThanOrEqual(2);
      expect(post?.sources?.some((source) => ["named-firsthand", "public-handle-firsthand"].includes(source.kind))).toBe(true);
      expect(post?.sources?.every((source) => source.accessedAt === "2026-08-24")).toBe(true);

      const article = buildArticleSchema(post!, "en")["@graph"][0] as Record<string, unknown>;
      expect(article.citation).toEqual(post?.sources?.map((source) => source.url));
      expect(article.isBasedOn).toEqual(post?.caseStudies?.map((item) => item.sourceUrl));
    }

    const view = readFileSync(join(process.cwd(), "components/blog/BlogPostView.tsx"), "utf8");
    expect(view).toContain("Open the public record");
    expect(view).toContain("What each link actually supports");
    expect(view).toContain("public-handle-firsthand");
  });

  it("publishes four sourced SEO, GEO, and Xiaohongshu stories with real cover assets", () => {
    const newCaseSlugs = [
      "seo-new-keyword-game-case-study",
      "geo-citation-recommendation-experiment",
      "xiaohongshu-plus-size-fashion-positioning",
      "xiaohongshu-founder-livestream-case-study"
    ];

    for (const slug of newCaseSlugs) {
      const post = blogPosts.find((candidate) => candidate.slug === slug);
      const visual = getBlogVisual(slug);
      expect(post, slug).toBeTruthy();
      expect(post?.publishedAt).toBe("2026-08-24");
      expect(post?.sectionsZh).toHaveLength(4);
      expect(post?.sectionsEn).toHaveLength(4);
      expect(post?.caseStudies).toHaveLength(1);
      expect(post?.caseStudies?.[0].actionsZh.length).toBeGreaterThanOrEqual(4);
      expect(post?.sources?.length).toBeGreaterThanOrEqual(3);
      expect(post?.sources?.some((source) => ["named-firsthand", "public-handle-firsthand"].includes(source.kind))).toBe(true);
      expect(post?.sources?.every((source) => source.accessedAt === "2026-08-24")).toBe(true);
      expect(visual.sourceUrl.startsWith("https://")).toBe(true);
      expect(existsSync(join(process.cwd(), "public", visual.src))).toBe(true);
    }
  });

  it("keeps the blog framing concise and removes editorial-process callouts", () => {
    const indexView = readFileSync(join(process.cwd(), "components/blog/BlogIndexView.tsx"), "utf8");
    const postView = readFileSync(join(process.cwd(), "components/blog/BlogPostView.tsx"), "utf8");

    expect(indexView).toContain("真实的增长博客案例分享");
    expect(indexView).toContain("学习全球的增长运营专家都是怎么做的。");
    expect(indexView).not.toContain("下面每张封面，都来自案例的原始页面。");
    expect(indexView).not.toContain("Every cover below comes from the case source itself.");
    expect(indexView).toContain('isEn ? "Read article" : "阅读文章"');
    expect(indexView).toContain('isEn ? "Read" : "阅读"');
    expect(indexView).not.toContain("从头看看这件事");
    expect(indexView).not.toContain("看故事，也看证据");
    expect(indexView).not.toContain("已核来源");
    expect(indexView).not.toContain("Sources checked");
    expect(postView).not.toContain("这篇材料怎么来的");
    expect(postView).not.toContain("HOW TO READ THIS");
    expect(postView).not.toContain("打开图片来源");
  });

  it("describes the free tools index as one complete ItemList", () => {
    const zh = buildToolsCollectionSchema("zh");
    const en = buildToolsCollectionSchema("en");

    expect(zh).toMatchObject({
      "@type": "CollectionPage",
      url: "https://www.finfold.app/tools",
      inLanguage: "zh-CN"
    });
    expect(zh.mainEntity.numberOfItems).toBe(toolPages.length);
    expect(zh.mainEntity.itemListElement.map((item) => item.position)).toEqual(
      toolPages.map((_, index) => index + 1)
    );
    expect(en).toMatchObject({
      url: "https://www.finfold.app/en/tools",
      inLanguage: "en"
    });
  });

  it("lets Bing recrawl noindex pages while keeping API and query waste blocked", () => {
    const rules = robots().rules;
    const normalizedRules = Array.isArray(rules) ? rules : [rules];
    const publicRule = normalizedRules[0];
    const bingRule = normalizedRules.find((rule) => rule.userAgent === "bingbot");
    const baiduRule = normalizedRules.find((rule) => rule.userAgent === "Baiduspider");

    expect(publicRule.disallow).toEqual(["/api/"]);
    expect(publicRule.disallow).not.toContain("/signup");
    expect(publicRule.disallow).not.toContain("/workbench");
    expect(bingRule?.disallow).toEqual([
      "/api/", "/*?*utm_", "/*?*fbclid=", "/*?*gclid=", "/*?*_rsc="
    ]);
    for (const path of ["/login", "/signup", "/workbench", "/billing", "/packages"]) {
      expect(bingRule?.disallow).not.toContain(path);
    }
    expect(baiduRule?.allow).toBe("/");
    expect(baiduRule?.disallow).toEqual(expect.arrayContaining([
      "/api/",
      "/login",
      "/signup",
      "/dashboard",
      "/operations",
      "/workbench",
      "/*?*utm_",
      "/*?*_rsc="
    ]));

    const authLayout = readFileSync(join(process.cwd(), "app/(auth)/layout.tsx"), "utf8");
    const dashboardLayout = readFileSync(join(process.cwd(), "app/(dashboard)/layout.tsx"), "utf8");
    expect(authLayout).toContain("index: false");
    expect(dashboardLayout).toContain("index: false");
  });

  it("gives every free generator distinct search copy and visible answer data", () => {
    for (const tool of toolPages) {
      expect(tool.searchTitleEn).toContain("Generator");
      expect(tool.searchTitleEn.length).toBeLessThanOrEqual(60);
      expect(tool.searchDescriptionEn.length).toBeGreaterThan(100);
      expect(tool.bestForEn).toHaveLength(3);
      expect(tool.outputsEn).toHaveLength(3);
      expect(tool.faq).toHaveLength(3);
    }

    const xiaohongshu = toolPages.find((tool) => tool.slug === "xiaohongshu-generator");
    expect(JSON.stringify(xiaohongshu)).toContain("Xiaohongshu content checklist");
  });

  it("keeps current non-brand search intents explicit and internally connected", () => {
    const linkedin = toolPages.find((tool) => tool.slug === "linkedin-post-generator");
    const reddit = toolPages.find((tool) => tool.slug === "reddit-post-generator");
    const xiaohongshu = toolPages.find((tool) => tool.slug === "xiaohongshu-generator");
    const founderContent = blogPosts.find((post) => post.slug === "content-compounding-founder-system");

    expect(linkedin?.searchTitleEn).toContain("Release Notes");
    expect(reddit?.searchDescriptionZh).toContain("发帖格式");
    expect(JSON.stringify(reddit?.faq)).toContain("没有加入 subreddit");
    expect(xiaohongshu?.searchDescriptionZh).toContain("无需登录即可预览");
    expect(linkedin?.relatedBlogSlug).toBe("content-compounding-founder-system");
    expect(founderContent?.seoTitleEn).toContain("Founder Content System");
    expect(getRelatedToolPages("linkedin-post-generator").map((tool) => tool.slug)).toEqual([
      "twitter-thread-generator",
      "product-hunt-launch-copy",
      "reddit-post-generator"
    ]);
  });

  it("describes each generator with application, breadcrumb, and FAQ data", () => {
    const graph = buildToolSchema(toolPages[0], "en")["@graph"];

    expect(graph.map((node) => node["@type"])).toEqual([
      "WebApplication",
      "BreadcrumbList",
      "FAQPage"
    ]);
    expect(graph[0]).toMatchObject({
      isAccessibleForFree: true,
      offers: { price: "0", priceCurrency: "USD" }
    });
  });

  it("uses defensible product claims in structured data", () => {
    const faq = JSON.stringify(buildFaqSchema("en"));
    const product = buildSoftwareApplicationSchema("en");

    expect(faq).not.toContain("scores posts on line 1 alone");
    expect(faq).not.toContain("demotes posts opening with");
    expect(product.inLanguage).toBe("en");
    expect(product.offers).toMatchObject({ lowPrice: "0", highPrice: "399", priceCurrency: "USD", offerCount: "5" });
  });

  it("provides Google with an explicit domain-level site name", () => {
    expect(buildWebSiteSchema()).toMatchObject({
      "@type": "WebSite",
      name: "Finfold",
      url: "https://www.finfold.app/"
    });
    expect(buildWebSiteSchema().alternateName).toContain("finfold.app");
  });

  it("uses a static 1200x630 social image without dynamic OG renderers", () => {
    const imagePath = join(process.cwd(), "public/brand/og-image.png");
    const png = readFileSync(imagePath);

    expect(brand.socialImage.url).toBe("/brand/og-image.png");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(existsSync(join(process.cwd(), "app/opengraph-image.tsx"))).toBe(false);
    expect(
      existsSync(
        join(process.cwd(), "app/share/[slug]/opengraph-image.tsx")
      )
    ).toBe(false);
  });
});
