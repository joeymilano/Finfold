import { afterEach, describe, expect, it, vi } from "vitest";
import {
  rankSitemapPageUrls,
  rankWikidataEntities,
  resolveWikidataOfficialSourcePages
} from "@/lib/wikidata-source-resolver";

describe("free Wikidata official-source resolution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("selects an exact product entity and rejects unrelated partial matches", () => {
    const ranked = rankWikidataEntities("GPT-6 Astra", [
      {
        id: "Q141270700",
        label: "GPT-6 Astra",
        description: "large language model by OpenAI",
        match: { type: "label", language: "en", text: "GPT-6 Astra" }
      },
      {
        id: "Q123",
        label: "Astra",
        description: "satellite platform",
        match: { type: "label", language: "en", text: "Astra" }
      }
    ]);

    expect(ranked[0]).toMatchObject({ id: "Q141270700", confidence: "high" });
    expect(ranked[1].confidence).toBe("low");
  });

  it("downgrades an ambiguous exact entity instead of auto-selecting it", () => {
    const ranked = rankWikidataEntities("Mercury", [
      { id: "Q1", label: "Mercury", description: "software platform" },
      { id: "Q2", label: "Mercury", description: "company and brand" }
    ]);

    expect(ranked[0].confidence).toBe("medium");
  });

  it("finds the matching official post in a sitemap and ignores other domains", () => {
    const sitemap = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://openai.com/index/gpt-6-astra/</loc></url>
        <url><loc>https://openai.com/index/unrelated-launch/</loc></url>
        <url><loc>https://example.com/index/gpt-6-astra/</loc></url>
      </urlset>`;

    expect(rankSitemapPageUrls("GPT-6 Astra", sitemap, "https://openai.com/")).toEqual([
      { url: "https://openai.com/index/gpt-6-astra/", score: 138 }
    ]);
  });

  it("decodes XML entities before validating official sitemap URLs", () => {
    const sitemap = `<urlset><url><loc>https://brand.example/news/acme-pro?lang=en&amp;view=full</loc></url></urlset>`;
    expect(rankSitemapPageUrls("Acme Pro", sitemap, "https://brand.example/")[0]?.url)
      .toBe("https://brand.example/news/acme-pro?lang=en&view=full");
  });

  it("follows a product developer to its official site and finds the matching post", async () => {
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.hostname === "www.wikidata.org" && url.searchParams.get("action") === "wbsearchentities") {
        return jsonResponse({
          search: [{
            id: "Q141270700",
            label: "GPT-6 Astra",
            description: "large language model by OpenAI",
            match: { type: "label", language: "en", text: "GPT-6 Astra" }
          }]
        });
      }
      if (url.hostname === "www.wikidata.org" && url.searchParams.get("ids") === "Q141270700") {
        return jsonResponse({ entities: { Q141270700: {
          id: "Q141270700",
          claims: { P178: [claim({ id: "Q21708200" })] }
        } } });
      }
      if (url.hostname === "www.wikidata.org" && url.searchParams.get("ids") === "Q21708200") {
        return jsonResponse({ entities: { Q21708200: {
          id: "Q21708200",
          claims: { P856: [claim("https://openai.com/")] }
        } } });
      }
      if (url.pathname === "/robots.txt") {
        return textResponse("User-agent: *\nSitemap: https://openai.com/sitemap.xml", "text/plain");
      }
      if (url.pathname === "/sitemap.xml") {
        return textResponse(`<sitemapindex>
          <sitemap><loc>https://openai.com/sitemap.xml/release/</loc></sitemap>
          <sitemap><loc>https://openai.com/sitemap.xml/product/</loc></sitemap>
          <sitemap><loc>https://openai.com/sitemap.xml/research/</loc></sitemap>
        </sitemapindex>`, "application/xml");
      }
      if (url.pathname.startsWith("/sitemap.xml/")) {
        return textResponse("<urlset><url><loc>https://openai.com/index/gpt-6-astra/</loc></url></urlset>", "application/xml");
      }
      return textResponse("not found", "text/plain", 404);
    }));

    const result = await resolveWikidataOfficialSourcePages("GPT-6 Astra");
    expect(result.matchedEntity).toMatchObject({ id: "Q141270700", confidence: "high" });
    expect(result.pages[0]).toMatchObject({
      url: "https://openai.com/index/gpt-6-astra/",
      confidence: "high",
      wikidataEntityId: "Q21708200"
    });
    expect(result.pages).toContainEqual(expect.objectContaining({
      url: "https://openai.com/",
      confidence: "medium"
    }));
  });
});

function claim(value: unknown) {
  return { rank: "normal", mainsnak: { datavalue: { value } } };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function textResponse(value: string, contentType: string, status = 200): Response {
  return new Response(value, { status, headers: { "Content-Type": contentType } });
}
