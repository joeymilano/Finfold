import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

const focusedCrawlerDisallow = [
  "/api/",
  "/login",
  "/signup",
  "/auth/",
  "/agents",
  "/billing",
  "/brand-memory",
  "/dashboard",
  "/founder",
  "/guardrails",
  "/invite",
  "/operations",
  "/overview",
  "/packages",
  "/settings",
  "/workbench",
  "/*?*utm_",
  "/*?*fbclid=",
  "/*?*gclid=",
  "/*?*_rsc="
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Auth and application pages already emit noindex metadata or redirect
        // to a noindex login page. Crawlers must be allowed to fetch those
        // responses; blocking them here prevents Google and other crawlers
        // from seeing the noindex directive and can leave URL-only results in
        // the index. Bing follows the same noindex discovery principle below.
        disallow: ["/api/"]
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        // Explicit welcome for Perplexity's crawler (GEO). Technically covered
        // by the wildcard above; the explicit rule keeps it safe if the
        // wildcard is ever tightened for quota reasons.
        disallow: ["/api/"]
      },
      {
        userAgent: "bingbot",
        allow: "/",
        // Allow already-indexed auth/product URLs to be recrawled so Bing
        // can see their noindex metadata. Still avoid API and query variants.
        disallow: ["/api/", "/*?*utm_", "/*?*fbclid=", "/*?*gclid=", "/*?*_rsc="]
      },
      {
        userAgent: "Baiduspider",
        allow: "/",
        // Baidu receives the same public-first crawl budget as Bing. The
        // Chinese landing and editorial pages are statically rendered, so it
        // can index useful copy without executing client JavaScript.
        disallow: focusedCrawlerDisallow
      }
    ],
    sitemap: `${brand.siteUrl}/sitemap.xml`,
    host: brand.siteUrl
  };
}
