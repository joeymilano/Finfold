import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";
import { toolPages } from "@/lib/tool-pages";
import { blogPosts } from "@/lib/blog-posts";
import { useCasePages } from "@/lib/use-case-pages";
import { comparePages } from "@/lib/compare-pages";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = brand.siteUrl;
  const publicPageDates = {
    home: new Date("2026-08-30T00:00:00.000Z"),
    toolsIndex: new Date("2026-08-24T00:00:00.000Z"),
    blogIndex: new Date("2026-08-24T00:00:00.000Z"),
    useCasesIndex: new Date("2026-08-16T00:00:00.000Z"),
    agents: new Date("2026-07-12T00:00:00.000Z"),
    support: new Date("2026-09-04T00:00:00.000Z"),
    extensionDownload: new Date("2026-09-16T00:00:00.000Z")
  };
  const localizedEntry = (
    zhPath: string,
    enPath: string,
    lastModified: Date
  ): MetadataRoute.Sitemap => {
    const languages = {
      "zh-CN": `${base}${zhPath}`,
      en: `${base}${enPath}`,
      "x-default": `${base}${zhPath}`
    };

    return [
      { url: `${base}${zhPath}`, lastModified, alternates: { languages } },
      { url: `${base}${enPath}`, lastModified, alternates: { languages } }
    ];
  };

  const legalRoutes = ["/privacy", "/terms", "/refund"];

  return [
    ...localizedEntry("/", "/en", publicPageDates.home),
    ...localizedEntry("/tools", "/en/tools", publicPageDates.toolsIndex),
    ...localizedEntry("/blog", "/en/blog", publicPageDates.blogIndex),
    ...localizedEntry("/use-cases", "/en/use-cases", publicPageDates.useCasesIndex),
    ...toolPages.flatMap((tool) =>
      localizedEntry(
        `/tools/${tool.slug}`,
        `/en/tools/${tool.slug}`,
        new Date(`${tool.updatedAt}T00:00:00.000Z`)
      )
    ),
    ...blogPosts.flatMap((post) =>
      localizedEntry(`/blog/${post.slug}`, `/en/blog/${post.slug}`, new Date(`${post.updatedAt}T00:00:00.000Z`))
    ),
    ...useCasePages.flatMap((page) =>
      localizedEntry(
        `/use-cases/${page.slug}`,
        `/en/use-cases/${page.slug}`,
        new Date(`${page.updatedAt}T00:00:00.000Z`)
      )
    ),
    // English-only comparison and learn pages (no zh counterpart yet), so they
    // get plain single entries instead of localized pairs.
    ...comparePages.map((page) => ({
      url: `${base}/en/compare/${page.slug}`,
      lastModified: new Date(`${page.updatedAt}T00:00:00.000Z`)
    })),
    {
      url: `${base}/en/learn/what-is-an-ai-marketing-agent`,
      lastModified: new Date("2026-09-10T00:00:00.000Z")
    },
    {
      url: `${base}/for-agents`,
      lastModified: publicPageDates.agents
    },
    {
      url: `${base}/support`,
      lastModified: publicPageDates.support
    },
    {
      url: `${base}/extension/download`,
      lastModified: publicPageDates.extensionDownload
    },
    ...legalRoutes.map((route) => ({
      url: `${base}${route}`,
      lastModified: new Date(brand.legal.effectiveDate)
    }))
  ];
}
