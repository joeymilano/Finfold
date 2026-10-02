import { describe, expect, it } from "vitest";
import {
  detectClearEntityQuery,
  extractSourceImageCandidates,
  officialDomainConfidence,
  rankCandidates
} from "@/lib/source-image-discovery";

describe("source-first image discovery", () => {
  it("extracts canonical, social, JSON-LD, relative, and highest-srcset candidates", () => {
    const html = `
      <html><head>
        <title>GPT-6 Astra launch</title>
        <link rel="canonical" href="/index/gpt-6-astra/">
        <meta property="og:image" content="/assets/astra-share.jpg">
        <meta property="og:image:width" content="1600">
        <meta property="og:image:height" content="900">
        <meta name="twitter:image" content="https://cdn.openai.com/astra-twitter.jpg">
        <script type="application/ld+json">{"image":{"url":"/assets/astra-structured.jpg","width":1200,"height":800}}</script>
      </head><body>
        <img src="/small.jpg" srcset="/small.jpg 480w, /hero-large.jpg 1800w" width="1800" height="1000" alt="GPT-6 Astra product interface">
      </body></html>`;
    const result = extractSourceImageCandidates(html, "https://openai.com/news/");
    expect(result.canonicalUrl).toBe("https://openai.com/index/gpt-6-astra/");
    expect(result.candidates.map((candidate) => candidate.originalUrl)).toEqual(expect.arrayContaining([
      "https://openai.com/assets/astra-share.jpg",
      "https://cdn.openai.com/astra-twitter.jpg",
      "https://openai.com/assets/astra-structured.jpg",
      "https://openai.com/hero-large.jpg"
    ]));
  });

  it("only makes sufficiently large, relevant images eligible for automatic selection", () => {
    const ranked = rankCandidates({
      pageUrl: "https://openai.com/index/gpt-6-astra/",
      canonicalUrl: "https://openai.com/index/gpt-6-astra/",
      title: "GPT-6 Astra launch",
      candidates: [
        { originalUrl: "https://openai.com/astra-hero.jpg", kind: "og", width: 1600, height: 900, alt: "GPT-6 Astra launch", supported: true },
        { originalUrl: "https://openai.com/icon.png", kind: "body", width: 1200, height: 1200, alt: "icon", supported: true },
        { originalUrl: "https://openai.com/astra-small.jpg", kind: "body", width: 640, height: 360, supported: true }
      ],
      provider: "official_page"
    });
    expect(ranked[0]).toMatchObject({ originalUrl: "https://openai.com/astra-hero.jpg", confidence: "high" });
    expect(ranked.find((candidate) => candidate.originalUrl.endsWith("astra-small.jpg"))?.confidence).not.toBe("high");
    expect(ranked.some((candidate) => candidate.originalUrl.endsWith("icon.png"))).toBe(false);
  });

  it("searches only clear entities and requires evidence for an official domain", () => {
    expect(detectClearEntityQuery("我要发一篇 GPT-6 Astra 发布帖，强调产品能力")).toBe("GPT-6 Astra");
    expect(detectClearEntityQuery("聊聊最近的效率趋势和一些感受")).toBeNull();
    expect(officialDomainConfidence({
      entity: "OpenAI GPT-6 Astra",
      pageUrl: "https://openai.com/index/gpt-6-astra/",
      title: "GPT-6 Astra | OpenAI",
      siteName: "OpenAI",
      resultIndex: 0
    })).toBe("high");
    expect(officialDomainConfidence({
      entity: "OpenAI GPT-6 Astra",
      pageUrl: "https://wikipedia.org/wiki/Astra",
      title: "Astra",
      resultIndex: 0
    })).toBe("low");
  });
});
