"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3, FlaskConical } from "@/components/ui/icons";
import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { TrackedCtaLink } from "@/components/marketing/TrackedCtaLink";
import { getStoredLocale } from "@/lib/theme";
import type { Locale } from "@/lib/i18n";
import {
  founderMarketingBlogSlugs,
  getRelatedBlogPosts,
  type BlogPost
} from "@/lib/blog-posts";
import { captureEvent } from "@/lib/posthog";
import { getBlogVisual } from "@/lib/blog-visuals";

const toolSlugByPost: Record<string, string> = {
  "x-twitter-algorithm-playbook": "twitter-thread-generator",
  "linkedin-algorithm-playbook": "linkedin-post-generator",
  "product-changelog-to-linkedin-post": "linkedin-post-generator",
  "xiaohongshu-algorithm-playbook": "xiaohongshu-generator",
  "reddit-algorithm-playbook": "reddit-post-generator",
  "reddit-shadowban-recovery-cases": "reddit-post-generator",
  "reddit-growth-vote-manipulation-risk": "reddit-post-generator",
  "reddit-first-customers-manual-outreach": "reddit-post-generator",
  "reddit-post-patterns-popsy-ai": "reddit-post-generator",
  "validate-demand-before-building": "reddit-post-generator",
  "content-compounding-founder-system": "linkedin-post-generator",
  "xiaohongshu-plus-size-fashion-positioning": "xiaohongshu-generator",
  "xiaohongshu-founder-livestream-case-study": "xiaohongshu-generator",
  "product-hunt-maker-comment-guide": "product-hunt-launch-copy",
  "human-reviewed-ai-social-media-manager": "linkedin-post-generator",
  "content-repurposing-workflow": "linkedin-post-generator"
};

type InternalResource = {
  destinationType: "landing" | "use_case" | "tool";
  destinationSlug: string;
  path: string;
  labelZh: string;
  labelEn: string;
};

const internalResourcesByPost: Record<string, InternalResource[]> = {
  "ai-marketing-agent-vs-automation": [
    { destinationType: "landing", destinationSlug: "homepage", path: "", labelZh: "Finfold AI 营销智能体", labelEn: "Finfold AI marketing agent" },
    { destinationType: "use_case", destinationSlug: "ai-marketing-for-small-business", path: "/use-cases/ai-marketing-for-small-business", labelZh: "小企业 AI 营销工作流", labelEn: "AI marketing for small business" }
  ],
  "ai-marketing-for-small-business-without-content-team": [
    { destinationType: "use_case", destinationSlug: "ai-marketing-for-small-business", path: "/use-cases/ai-marketing-for-small-business", labelZh: "小企业 AI 营销工作流", labelEn: "AI marketing for small business" },
    { destinationType: "use_case", destinationSlug: "ai-marketing-for-founders", path: "/use-cases/ai-marketing-for-founders", labelZh: "创始人 AI 营销指南", labelEn: "AI marketing for founders" }
  ],
  "human-reviewed-ai-social-media-manager": [
    { destinationType: "use_case", destinationSlug: "ai-marketing-for-small-business", path: "/use-cases/ai-marketing-for-small-business", labelZh: "小企业 AI 营销工作流", labelEn: "AI marketing for small business" },
    { destinationType: "tool", destinationSlug: "linkedin-post-generator", path: "/tools/linkedin-post-generator", labelZh: "LinkedIn 帖子生成器", labelEn: "LinkedIn post generator" },
    { destinationType: "tool", destinationSlug: "xiaohongshu-generator", path: "/tools/xiaohongshu-generator", labelZh: "小红书文案生成器", labelEn: "Xiaohongshu content generator" }
  ],
  "content-repurposing-workflow": [
    { destinationType: "use_case", destinationSlug: "content-repurposing-for-solopreneurs", path: "/use-cases/content-repurposing-for-solopreneurs", labelZh: "一人公司内容复用场景", labelEn: "Content repurposing for solopreneurs" },
    { destinationType: "tool", destinationSlug: "linkedin-post-generator", path: "/tools/linkedin-post-generator", labelZh: "LinkedIn 帖子生成器", labelEn: "LinkedIn post generator" },
    { destinationType: "tool", destinationSlug: "twitter-thread-generator", path: "/tools/twitter-thread-generator", labelZh: "X / Twitter 线程生成器", labelEn: "X / Twitter thread generator" },
    { destinationType: "tool", destinationSlug: "reddit-post-generator", path: "/tools/reddit-post-generator", labelZh: "Reddit 帖子生成器", labelEn: "Reddit post generator" }
  ],
  "reddit-shadowban-recovery-cases": [
    { destinationType: "tool", destinationSlug: "reddit-post-generator", path: "/tools/reddit-post-generator", labelZh: "Reddit 帖子生成器", labelEn: "Reddit post generator" },
    { destinationType: "use_case", destinationSlug: "ai-marketing-for-founders", path: "/use-cases/ai-marketing-for-founders", labelZh: "创始人 AI 营销指南", labelEn: "AI marketing for founders" }
  ],
  "reddit-growth-vote-manipulation-risk": [
    { destinationType: "tool", destinationSlug: "reddit-post-generator", path: "/tools/reddit-post-generator", labelZh: "合规的 Reddit 草稿工具", labelEn: "Reviewable Reddit draft tool" },
    { destinationType: "use_case", destinationSlug: "ai-marketing-for-founders", path: "/use-cases/ai-marketing-for-founders", labelZh: "创始人增长工作流", labelEn: "Founder growth workflow" }
  ],
  "reddit-first-customers-manual-outreach": [
    { destinationType: "tool", destinationSlug: "reddit-post-generator", path: "/tools/reddit-post-generator", labelZh: "Reddit 帖子生成器", labelEn: "Reddit post generator" },
    { destinationType: "use_case", destinationSlug: "ai-marketing-for-small-business", path: "/use-cases/ai-marketing-for-small-business", labelZh: "小团队营销工作流", labelEn: "Small-team marketing workflow" }
  ],
  "reddit-post-patterns-popsy-ai": [
    { destinationType: "tool", destinationSlug: "reddit-post-generator", path: "/tools/reddit-post-generator", labelZh: "用真人材料准备 Reddit 草稿", labelEn: "Draft a Reddit post from real source material" },
    { destinationType: "use_case", destinationSlug: "content-repurposing-for-solopreneurs", path: "/use-cases/content-repurposing-for-solopreneurs", labelZh: "一人公司内容复用", labelEn: "Content repurposing for solopreneurs" }
  ],
  "validate-demand-before-building": [
    { destinationType: "use_case", destinationSlug: "ai-marketing-for-founders", path: "/use-cases/ai-marketing-for-founders", labelZh: "创始人 AI 营销指南", labelEn: "AI marketing for founders" },
    { destinationType: "tool", destinationSlug: "reddit-post-generator", path: "/tools/reddit-post-generator", labelZh: "Reddit 调研帖生成器", labelEn: "Reddit research post generator" }
  ],
  "content-compounding-founder-system": [
    { destinationType: "use_case", destinationSlug: "content-repurposing-for-solopreneurs", path: "/use-cases/content-repurposing-for-solopreneurs", labelZh: "一人公司内容复用工作流", labelEn: "Solopreneur content repurposing workflow" },
    { destinationType: "tool", destinationSlug: "linkedin-post-generator", path: "/tools/linkedin-post-generator", labelZh: "LinkedIn 帖子生成器", labelEn: "LinkedIn post generator" }
  ],
  "xiaohongshu-plus-size-fashion-positioning": [
    { destinationType: "tool", destinationSlug: "xiaohongshu-generator", path: "/tools/xiaohongshu-generator", labelZh: "把真实商品和人群材料整理成小红书草稿", labelEn: "Turn real product and audience material into a Xiaohongshu draft" },
    { destinationType: "use_case", destinationSlug: "ai-marketing-for-small-business", path: "/use-cases/ai-marketing-for-small-business", labelZh: "小企业 AI 营销工作流", labelEn: "AI marketing for small business" }
  ],
  "xiaohongshu-founder-livestream-case-study": [
    { destinationType: "tool", destinationSlug: "xiaohongshu-generator", path: "/tools/xiaohongshu-generator", labelZh: "用主理人经历准备小红书内容", labelEn: "Prepare Xiaohongshu content from a founder's own experience" },
    { destinationType: "use_case", destinationSlug: "content-repurposing-for-solopreneurs", path: "/use-cases/content-repurposing-for-solopreneurs", labelZh: "把直播材料继续拆成内容", labelEn: "Repurpose live-session material into more content" }
  ]
};

const sourceKindLabels = {
  official: { zh: "官方资料", en: "Official source" },
  "named-firsthand": { zh: "实名第一手", en: "Named firsthand" },
  "public-handle-firsthand": { zh: "公开账号自述", en: "Public-handle firsthand" },
  "company-reported": { zh: "公司自报", en: "Company-reported" },
  "secondary-analysis": { zh: "二手分析", en: "Secondary analysis" }
} as const;

function Paragraphs({ body }: { body: string }) {
  return (
    <div className="grid gap-5">
      {body.split("\n\n").map((paragraph) => (
        <p key={paragraph} className="text-[15px] leading-8 text-fg-muted sm:text-[17px] sm:leading-9">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

export function BlogPostView({
  post,
  initialLocale,
  localeHref
}: {
  post: BlogPost;
  initialLocale?: Locale;
  localeHref?: string;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale ?? "zh");

  useEffect(() => {
    if (!initialLocale) {
      setLocale(getStoredLocale());
    }
    captureEvent("landing_view", {
      blogPost: post.slug,
      contentType: "blog_post",
      contentSlug: post.slug,
      locale: initialLocale ?? getStoredLocale()
    });
    function onLocaleChange(e: Event) {
      if (!initialLocale) {
        setLocale((e as CustomEvent<Locale>).detail);
      }
    }
    window.addEventListener("finfold-locale-change", onLocaleChange);
    return () => window.removeEventListener("finfold-locale-change", onLocaleChange);
  }, [initialLocale, post.slug]);

  const isEn = locale === "en";
  const title = isEn ? post.titleEn : post.titleZh;
  const description = isEn ? post.descriptionEn : post.descriptionZh;
  const kicker = isEn ? post.kickerEn : post.kickerZh;
  const intro = isEn ? post.introEn : post.introZh;
  const sections = isEn ? post.sectionsEn : post.sectionsZh;
  const experiments = isEn ? post.experimentsEn : post.experimentsZh;
  const experimentTitle = isEn ? post.experimentTitleEn : post.experimentTitleZh;
  const author = isEn ? post.authorEn : post.authorZh;
  const disclosure = isEn ? post.disclosureEn : post.disclosureZh;
  const caseStudies = post.caseStudies ?? [];
  const sources = post.sources ?? [];
  const prefix = isEn ? "/en" : "";
  const relatedPosts = getRelatedBlogPosts(post.slug);
  const visual = getBlogVisual(post.slug);
  const toolSlug = toolSlugByPost[post.slug];
  const linksToFounderGuide = founderMarketingBlogSlugs.has(post.slug);
  const internalResources = internalResourcesByPost[post.slug] ?? (
    linksToFounderGuide
      ? [{
          destinationType: "use_case" as const,
          destinationSlug: "ai-marketing-for-founders",
          path: "/use-cases/ai-marketing-for-founders",
          labelZh: "没有内容团队的创始人 AI 营销指南",
          labelEn: "AI marketing for founders without a content team"
        }]
      : []
  );

  return (
    <>
      <main className="relative min-h-screen overflow-hidden bg-bg text-fg">
        <div className="grain" aria-hidden />
        <PublicSiteHeader locale={locale} localeHref={localeHref} />

        <div className="mx-auto max-w-6xl px-5 pt-8">
          <Link href={`${prefix}/blog`} className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-fg-muted transition-colors hover:text-fg">
            <ArrowLeft className="h-4 w-4" />
            {isEn ? "Back to field notes" : "回到增长现场"}
          </Link>
        </div>

        <article>
          <header className="mx-auto max-w-6xl px-5 pb-10 pt-10 sm:pb-14 sm:pt-16">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-end">
              <div>
                <p className="eyebrow-mono text-brand">{kicker}</p>
                <h1 className={`mt-5 max-w-4xl text-balance text-4xl leading-[1.08] text-fg sm:text-6xl ${isEn ? "font-display" : "font-display-zh"}`}>
                  {title}
                </h1>
                <p className="mt-6 max-w-3xl text-base leading-8 text-fg-muted sm:text-lg">{description}</p>
              </div>
              <div className="border-l-2 border-brand/50 pl-4 text-xs leading-6 text-fg-muted">
                <p className="flex items-center gap-2 font-semibold text-fg">
                  <Clock3 className="h-3.5 w-3.5 text-brand" />
                  {isEn ? `${post.readingMinutes} min read` : `大约读 ${post.readingMinutes} 分钟`}
                </p>
                <p className="mt-2">
                  {caseStudies.length > 0
                    ? (isEn ? `${caseStudies.length} public cases · ${sources.length} cited sources` : `${caseStudies.length} 个公开案例 · ${sources.length} 条资料来源`)
                    : (isEn ? "A working note with its limits left in" : "保留事实边界的工作笔记")}
                </p>
                <p className="mt-2 font-semibold text-fg">{author}</p>
                <p className="mt-2">{isEn ? "Updated" : "最后更新"} · <time dateTime={post.updatedAt}>{post.updatedAt}</time></p>
                <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-5">{disclosure}</p>
              </div>
            </div>
          </header>

          <figure className="relative mx-auto max-w-6xl overflow-hidden border-y border-hairline sm:rounded-[1.75rem] sm:border">
            <Image
              src={visual.src}
              alt={isEn ? visual.altEn : visual.altZh}
              width={1792}
              height={1008}
              priority
              className="aspect-[16/8.5] w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <figcaption className="absolute bottom-4 left-5 right-5 text-xs leading-5 text-white/80 sm:bottom-6 sm:left-7 sm:max-w-lg">
              {isEn ? visual.captionEn : visual.captionZh}{" "}
              <a href={visual.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-white underline decoration-white/45 underline-offset-4 hover:decoration-white">
                {isEn ? visual.sourceLabelEn : visual.sourceLabelZh}
              </a>
            </figcaption>
          </figure>

          <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
            <div>
              <div className={`border-b border-hairline pb-12 text-xl leading-10 text-fg sm:text-2xl sm:leading-[1.85] ${isEn ? "font-display" : "font-display-zh"}`}>
                <Paragraphs body={intro} />
              </div>

              <div className="mt-14 grid gap-14 sm:mt-20 sm:gap-20">
                {sections.map((section, index) => (
                  <section key={section.heading} id={`section-${index + 1}`} className="scroll-mt-24">
                    <h2 className={`max-w-3xl text-balance text-2xl leading-tight text-fg sm:text-3xl ${isEn ? "font-display" : "font-display-zh"}`}>
                      {section.heading}
                    </h2>
                    <div className="mt-7">
                      <Paragraphs body={section.body} />
                    </div>
                  </section>
                ))}
              </div>

              {caseStudies.length > 0 ? (
                <details className="group mt-16 rounded-2xl border border-hairline bg-surface">
                  <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-5 text-sm font-semibold text-fg sm:px-6">
                    <span>
                      {isEn
                        ? `Open the ${caseStudies.length} case records and their limits`
                        : `展开 ${caseStudies.length} 份案例记录和证据边界`}
                    </span>
                    <span className="text-brand transition-transform group-open:rotate-45">＋</span>
                  </summary>
                  <div className="grid gap-4 border-t border-hairline p-4 sm:p-6">
                    {caseStudies.map((caseStudy) => (
                      <article key={`${caseStudy.subjectName}:${caseStudy.sourceUrl}`} className="rounded-xl border border-hairline bg-bg/40 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-base font-semibold text-fg">{caseStudy.subjectName}</h3>
                            <p className="mt-1 text-xs text-fg-muted">
                              {[caseStudy.publicHandle ? `u/${caseStudy.publicHandle}` : null, caseStudy.product].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <span className="rounded-full bg-brand/[0.08] px-3 py-1 text-[11px] font-semibold text-brand">
                            {isEn ? caseStudy.verificationEn : caseStudy.verificationZh}
                          </span>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-fg-muted">
                          <span className="font-semibold text-fg">{isEn ? "Reported result" : "披露结果"}</span>
                          {" · "}{isEn ? caseStudy.resultEn : caseStudy.resultZh}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-fg-muted">
                          <span className="font-semibold text-fg">{isEn ? "What remains uncertain" : "仍然不能确认"}</span>
                          {" · "}{isEn ? caseStudy.failureEn : caseStudy.failureZh}
                        </p>
                        <a href={caseStudy.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand hover:underline">
                          {isEn ? "Open the public record" : "查看公开记录"}<ArrowRight className="h-3.5 w-3.5" />
                        </a>
                      </article>
                    ))}
                  </div>
                </details>
              ) : null}

              {sources.length > 0 ? (
                <section className="mt-16 border-t border-hairline pt-10" aria-labelledby="sources-heading">
                  <p className="eyebrow-mono text-brand">{isEn ? "SOURCES" : "资料来源"}</p>
                  <h2 id="sources-heading" className={`mt-3 text-2xl text-fg ${isEn ? "font-display" : "font-display-zh"}`}>
                    {isEn ? "What each link actually supports" : "每条链接具体支撑什么"}
                  </h2>
                  <ol className="mt-5 grid gap-3">
                    {sources.map((source) => {
                      const kind = sourceKindLabels[source.kind];
                      return (
                        <li key={source.url} className="rounded-xl border border-hairline p-4">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                            <span className="rounded-full bg-brand/[0.08] px-2.5 py-1 text-brand">{isEn ? kind.en : kind.zh}</span>
                            <span className="text-fg-muted">{isEn ? "Accessed" : "访问日期"} {source.accessedAt}</span>
                          </div>
                          <a href={source.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-start gap-2 font-semibold leading-6 text-fg hover:text-brand">
                            <span>{isEn ? source.titleEn : source.titleZh}</span><ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0" />
                          </a>
                          <p className="mt-2 text-sm leading-6 text-fg-muted">{isEn ? source.supportsEn : source.supportsZh}</p>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ) : null}
            </div>

          </div>

          <section className="border-y border-hairline bg-fg text-bg">
            <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
              <p className="eyebrow-mono !text-bg/60 flex items-center gap-2">
                <FlaskConical className="h-4 w-4" /> {isEn ? "SMALL BET, REAL SIGNAL" : "别立大志，先做小实验"}
              </p>
              <h2 className={`mt-4 max-w-3xl text-balance text-3xl leading-tight sm:text-5xl ${isEn ? "font-display" : "font-display-zh"}`}>
                {experimentTitle}
              </h2>
              <div className="mt-10 grid gap-px overflow-hidden rounded-2xl bg-bg/20 md:grid-cols-3">
                {experiments.map((experiment) => (
                  <div key={experiment.label} className="bg-fg p-6 sm:p-8">
                    <p className="font-mono text-xs font-semibold tracking-[0.14em] text-brand">{experiment.label}</p>
                    <p className="mt-4 text-sm leading-7 text-bg/75 sm:text-base">{experiment.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-4xl px-5 py-16 sm:py-24">
            {internalResources.length > 0 ? (
              <section className="mb-6">
                <p className="eyebrow-mono text-brand">{isEn ? "CONTINUE THE WORKFLOW" : "继续进入对应工作流"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {internalResources.map((resource) => (
                    <Link
                      key={resource.destinationType + ":" + resource.destinationSlug}
                      href={prefix + resource.path}
                      onClick={() => captureEvent("content_internal_link_clicked", {
                        sourceType: "blog_post",
                        sourceSlug: post.slug,
                        destinationType: resource.destinationType,
                        destinationSlug: resource.destinationSlug,
                        locale
                      })}
                      className="panel panel-hover group flex items-center justify-between gap-4 p-5 text-sm font-semibold leading-6 text-fg"
                    >
                      <span>{isEn ? resource.labelEn : resource.labelZh}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-brand transition-transform group-hover:translate-x-1" />
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
            <div className="relative overflow-hidden rounded-[1.75rem] border border-brand/30 bg-brand/[0.07] p-7 text-center sm:p-12">
              <p className="eyebrow-mono text-brand">{isEn ? "BRING YOUR OWN SOURCE" : "拿一段真实材料继续"}</p>
              <h2 className={`mx-auto mt-4 max-w-2xl text-balance text-2xl leading-tight text-fg sm:text-4xl ${isEn ? "font-display" : "font-display-zh"}`}>
                {isEn
                  ? `Check whether your source can carry a ${post.platform} post.`
                  : `先看你的材料，能不能托住一篇 ${post.platform} 内容。`}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-fg-muted">
                {isEn ? "Look for a person, a moment, evidence, and a consequence before generating a sentence." : "人物、时刻、证据和后果先齐了，再开始生成。"}
              </p>
              <TrackedCtaLink
                href={toolSlug ? `${prefix}/tools/${toolSlug}` : "/signup"}
                sourceType="blog_post"
                sourceSlug={post.slug}
                destination={toolSlug ? "tool:" + toolSlug : "signup"}
                locale={locale}
                className="btn-primary focus-ring mt-7 inline-flex items-center gap-2 text-sm"
              >
                {toolSlug
                  ? (isEn ? "Check my source first" : "先检查我的材料")
                  : (isEn ? "Start with Finfold" : "开始使用 Finfold")} <ArrowRight className="h-4 w-4" />
              </TrackedCtaLink>
            </div>

            <section className="mt-16 border-t border-hairline pt-10">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className={`text-2xl text-fg ${isEn ? "font-display" : "font-display-zh"}`}>{isEn ? "More field notes" : "接着往下聊"}</h2>
                <Link href={`${prefix}/blog`} className="text-xs font-semibold text-brand hover:underline">{isEn ? "View all" : "全部文章"}</Link>
              </div>
              <div className="mt-5 grid gap-3">
                {relatedPosts.map((related, index) => (
                  <Link
                    key={related.slug}
                    href={`${prefix}/blog/${related.slug}`}
                    onClick={() => captureEvent("content_internal_link_clicked", {
                      sourceType: "blog_post",
                      sourceSlug: post.slug,
                      destinationType: "blog_post",
                      destinationSlug: related.slug,
                      locale
                    })}
                    className="panel panel-hover group flex items-center gap-5 p-5"
                  >
                    <span className="font-display text-3xl text-brand/35">0{index + 1}</span>
                    <span className="min-w-0 flex-1 text-sm font-semibold leading-6 text-fg">{isEn ? related.titleEn : related.titleZh}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-fg-muted transition-transform group-hover:translate-x-1 group-hover:text-brand" />
                  </Link>
                ))}
              </div>
            </section>
          </section>
        </article>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
