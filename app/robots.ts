import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Auth and application pages already emit noindex metadata or redirect
        // to a noindex login page. Crawlers must be allowed to fetch those
        // responses; blocking them here prevents Google and Bing from seeing
        // the noindex directive and can leave URL-only results in the index.
        disallow: ["/api/"]
      }
    ],
    sitemap: `${brand.siteUrl}/sitemap.xml`,
    host: brand.siteUrl
  };
}
