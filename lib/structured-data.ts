import { brand } from "@/lib/brand";
import type { BlogPost } from "@/lib/blog-posts";
import type { ToolPageConfig } from "@/lib/tool-pages";
import { toolPages } from "@/lib/tool-pages";

/**
 * JSON-LD structured data for the landing page — SoftwareApplication,
 * Organization, and FAQPage. Rendered as a
 * <script type="application/ld+json"> in the page, not the root layout,
 * since it describes the product page, not every route in the app.
 */
export function buildSoftwareApplicationSchema(locale: "zh" | "en" = "zh") {
  const isEn = locale === "en";
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: brand.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: isEn
      ? brand.description
      : "面向创始人、独立开发者和精简团队的可审核 AI 营销智能体：审查网站、准备增长任务、生成平台原生内容，并用真实结果改进下一轮。",
    url: isEn ? `${brand.siteUrl}/en` : brand.siteUrl,
    inLanguage: isEn ? "en" : "zh-CN",
    audience: {
      "@type": "Audience",
      audienceType: isEn ? "Founders, indie builders, and lean growth teams" : "创始人、独立开发者和精简增长团队"
    },
    featureList: isEn
      ? ["Website growth audit", "Reviewable growth missions", "Publishable copy and visual assets", "14 platform rulebooks", "Performance feedback", "Agent access via MCP"]
      : ["网站增长诊断", "可审核增长任务", "可发布文案与视觉内容", "14 平台规则库", "表现回流", "Agent MCP 接入"],
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "0",
      highPrice: isEn ? "399" : "2999",
      priceCurrency: isEn ? "USD" : "CNY",
      offerCount: "5"
    }
  };
}

export function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.name,
    url: brand.siteUrl,
    logo: `${brand.siteUrl}/brand/app-icon.png`,
    email: brand.legal.contactEmail
  };
}

/**
 * Homepage-only WebSite data gives search engines an explicit, consistent
 * site-name signal. Google supports site names at the domain level, so this
 * should be rendered on `/` rather than repeated on every locale or route.
 */
export function buildWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: brand.name,
    alternateName: ["Finfold App", brand.chineseName, "finfold.app"],
    url: `${brand.siteUrl}/`
  };
}

export function buildArticleSchema(post: BlogPost, locale: "zh" | "en") {
  const isEn = locale === "en";
  const prefix = isEn ? "/en" : "";
  const url = `${brand.siteUrl}${prefix}/blog/${post.slug}`;
  const headline = isEn ? post.titleEn : post.titleZh;
  const description = isEn
    ? post.seoDescriptionEn ?? post.descriptionEn
    : post.seoDescriptionZh ?? post.descriptionZh;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline,
        description,
        datePublished: post.publishedAt,
        dateModified: post.updatedAt,
        inLanguage: isEn ? "en" : "zh-CN",
        articleSection: post.platform,
        mainEntityOfPage: url,
        image: `${brand.siteUrl}/editorial/growth-field-notes.webp`,
        author: {
          "@type": "Person",
          name: "Joey Zhao",
          jobTitle: isEn ? "Founder of Finfold" : "Finfold 创始人",
          worksFor: { "@type": "Organization", name: brand.name, url: brand.siteUrl }
        },
        publisher: {
          "@type": "Organization",
          name: brand.name,
          logo: { "@type": "ImageObject", url: `${brand.siteUrl}/brand/app-icon.png` }
        }
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: isEn ? "Growth field notes" : "增长现场",
            item: `${brand.siteUrl}${prefix}/blog`
          },
          {
            "@type": "ListItem",
            position: 2,
            name: headline,
            item: url
          }
        ]
      }
    ]
  };
}

export function buildToolSchema(config: ToolPageConfig, locale: "zh" | "en") {
  const isEn = locale === "en";
  const prefix = isEn ? "/en" : "";
  const url = `${brand.siteUrl}${prefix}/tools/${config.slug}`;
  const name = isEn ? config.heroEn : config.heroZh;
  const description = isEn ? config.searchDescriptionEn : config.searchDescriptionZh;
  const outputs = isEn ? config.outputsEn : config.outputsZh;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${url}#application`,
        name,
        description,
        url,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: isEn ? "en" : "zh-CN",
        isAccessibleForFree: true,
        featureList: outputs,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: isEn ? "USD" : "CNY"
        },
        provider: { "@type": "Organization", name: brand.name, url: brand.siteUrl }
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: isEn ? "Free AI content generators" : "免费 AI 内容生成器",
            item: `${brand.siteUrl}${prefix}/tools`
          },
          {
            "@type": "ListItem",
            position: 2,
            name,
            item: url
          }
        ]
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: config.faq.map((item) => ({
          "@type": "Question",
          name: isEn ? item.questionEn : item.questionZh,
          acceptedAnswer: {
            "@type": "Answer",
            text: isEn ? item.answerEn : item.answerZh
          }
        }))
      }
    ]
  };
}

export function buildToolsCollectionSchema(locale: "zh" | "en") {
  const isEn = locale === "en";
  const prefix = isEn ? "/en" : "";

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: isEn ? "Free AI Content Generators" : "免费 AI 内容生成器",
    description: isEn
      ? "Free platform-native content generators powered by Finfold's real channel rules."
      : "使用 Finfold 真实平台规则的免费原生内容生成器。",
    url: `${brand.siteUrl}${prefix}/tools`,
    inLanguage: isEn ? "en" : "zh-CN",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: toolPages.length,
      itemListElement: toolPages.map((tool, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: isEn ? tool.titleEn : tool.titleZh,
        url: `${brand.siteUrl}${prefix}/tools/${tool.slug}`
      }))
    }
  };
}

export function buildFaqSchema(locale: "zh" | "en") {
  const qa =
    locale === "en"
      ? [
          {
            q: "What is an AI marketing agent?",
            a: "An AI marketing agent helps a team move from evidence to a reviewable marketing action: it can inspect a website, prepare a growth mission, create channel-native deliverables, and carry confirmed outcomes into the next cycle. Finfold keeps consequential actions and publishing under human approval."
          },
          {
            q: "Can Claude or ChatGPT replace Finfold for marketing?",
            a: "Claude and ChatGPT can generate strong individual drafts. Finfold handles the repeatable marketing workflow around them: saved Brand Memory, platform rules, copy and visual deliverables, publish state, performance feedback, and next-cycle learning. Your AI agents can also call Finfold through MCP."
          },
          {
            q: "How many platforms does Finfold support?",
            a: "14 platforms across China and global channels: WeChat Official Account, Xiaohongshu, Zhihu, WeChat Moments, X/Twitter, LinkedIn, Instagram, Facebook, Reddit, Product Hunt, Threads, Hacker News, Indie Hackers, and Medium/Substack."
          },
          {
            q: "Does Finfold publish marketing content without approval?",
            a: "No. Finfold prepares editable missions, copy, and visuals. A human verifies the facts, approves consequential actions, and decides what is published."
          }
        ]
      : [
          {
            q: "什么是 AI 营销智能体？",
            a: "AI 营销智能体帮助团队把证据变成可审核的营销行动：审查网站、准备增长任务、生成平台原生内容，并把确认过的结果带入下一轮。Finfold 的关键操作与最终发布始终需要人工批准。"
          },
          {
            q: "Claude 或 ChatGPT 能替代 Finfold 做营销吗？",
            a: "Claude 和 ChatGPT 可以生成高质量的单篇草稿。Finfold 负责它们之外可持续运行的营销工作流：品牌记忆、平台规则、文案与视觉交付、发布状态、表现回流和下一轮学习，并支持 AI Agents 通过 MCP 直接调用。"
          },
          {
            q: "Finfold 支持多少个平台？",
            a: "覆盖国内和全球共 14 个平台：微信公众号、小红书、知乎、朋友圈、X/Twitter、LinkedIn、Instagram、Facebook、Reddit、Product Hunt、Threads、Hacker News、Indie Hackers、Medium/Substack。"
          },
          {
            q: "Finfold 会在无人审核时自动发布营销内容吗？",
            a: "不会。Finfold 准备可编辑的任务、文案和视觉内容；事实核对、重要操作批准和最终发布决定仍由人完成。"
          }
        ];

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a }
    }))
  };
}
