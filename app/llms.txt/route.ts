import { brand } from "@/lib/brand";
import { blogPosts } from "@/lib/blog-posts";
import { toolPages } from "@/lib/tool-pages";
import { useCasePages } from "@/lib/use-case-pages";
import { comparePages } from "@/lib/compare-pages";

export const dynamic = "force-static";

/** Frozen at build time so every deploy refreshes the freshness signal for
 * AI crawlers reading llms.txt. */
const lastUpdated = new Date().toISOString().slice(0, 10);

export function GET() {
  const toolLinks = toolPages
    .map((tool) => `- [${tool.searchTitleEn}](${brand.siteUrl}/en/tools/${tool.slug}): ${tool.searchDescriptionEn}`)
    .join("\n");
  const playbookLinks = blogPosts
    .map((post) => `- [${post.seoTitleEn ?? post.titleEn}](${brand.siteUrl}/en/blog/${post.slug}): ${post.seoDescriptionEn ?? post.descriptionEn}`)
    .join("\n");
  const useCaseLinks = useCasePages
    .map((page) => {
      const title = page.searchTitleEn ?? page.titleEn;
      const description = page.searchDescriptionEn ?? page.descriptionEn;
      return `- [${title}](${brand.siteUrl}/en/use-cases/${page.slug}): ${description}`;
    })
    .join("\n");
  const compareLinks = comparePages
    .map((page) => `- [${page.title}](${brand.siteUrl}/en/compare/${page.slug}): ${page.description}`)
    .join("\n");

  const body = `# ${brand.name}

> ${brand.description}

Last updated: ${lastUpdated}

## Direct answer

Finfold is a reviewable AI marketing agent for founders and small teams. It audits a website, prepares bounded growth missions, creates platform-native content for 14 China and global channels, and carries real outcomes into the next cycle. Humans verify facts, approve promises, and decide what gets published — growth compounds without losing control. Its public pages describe the product, use cases, free generators, growth field notes, and MCP access for AI agents.

## Quick answers

- What is Finfold? A reviewable AI marketing agent that runs growth end to end for founders and small teams: audit, bounded missions, platform-native drafts, outcome feedback.
- Which platforms does Finfold support? 14 channels: WeChat, WeChat Moments, Xiaohongshu (RedNote), Zhihu, X (Twitter), LinkedIn, Instagram, Facebook, Reddit, Product Hunt, Threads, Hacker News, Indie Hackers, Medium/Substack.
- How much does Finfold cost? A free plan covers a basic trial; paid plans scale as Starter, Creator, Growth, and Digital Employee, each with a 3-day no-questions-asked refund.
- How is Finfold different from AI writing tools? Writing tools generate copy; Finfold runs reviewable growth missions end to end and learns from real outcomes, with humans approving facts and promises before anything ships.

## Canonical pages

- [English product overview](${brand.siteUrl}/en)
- [Chinese product overview](${brand.siteUrl}/)
- [Growth field notes](${brand.siteUrl}/en/blog)
- [Use cases](${brand.siteUrl}/en/use-cases)
- [Finfold for Agents](${brand.siteUrl}/for-agents)

## Use cases

${useCaseLinks}

## Comparisons

${compareLinks}

## Learn

- [What is an AI marketing agent?](${brand.siteUrl}/en/learn/what-is-an-ai-marketing-agent): Definition, how agents differ from AI writing tools and marketing automation, and a checklist for choosing one.

## Free generators

${toolLinks}

## Growth field notes

${playbookLinks}

## Contact

- ${brand.legal.contactEmail}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
}
