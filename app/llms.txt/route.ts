import { brand } from "@/lib/brand";
import { blogPosts } from "@/lib/blog-posts";
import { toolPages } from "@/lib/tool-pages";
import { useCasePages } from "@/lib/use-case-pages";

export const dynamic = "force-static";

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

  const body = `# ${brand.name}

> ${brand.description}

Finfold is a reviewable AI marketing agent for small teams. It audits websites, prepares bounded growth missions, creates platform-native content for 14 China and global channels, and carries real outcomes into the next cycle. Humans verify facts, approve promises, and decide what gets published. Its public pages describe the product, use cases, free generators, growth field notes, and MCP access for AI agents.

## Canonical pages

- [English product overview](${brand.siteUrl}/en)
- [Chinese product overview](${brand.siteUrl}/)
- [Growth field notes](${brand.siteUrl}/en/blog)
- [Use cases](${brand.siteUrl}/en/use-cases)
- [Finfold for Agents](${brand.siteUrl}/for-agents)

## Use cases

${useCaseLinks}

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
