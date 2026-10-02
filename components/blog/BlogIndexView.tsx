import Image from "next/image";
import { ArrowRight, BookOpenText } from "@/components/ui/icons";
import { growthCaseStudyBlogPosts } from "@/lib/growth-case-study-blog-posts";
import { getBlogVisual } from "@/lib/blog-visuals";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { MarketingLandingTracker } from "@/components/marketing/MarketingLandingTracker";
import { MarketingResourceLink } from "@/components/marketing/MarketingResourceLink";
import type { Locale } from "@/lib/i18n";

export function BlogIndexView({ locale }: { locale: Locale }) {
  const isEn = locale === "en";
  const prefix = isEn ? "/en" : "";
  const preferredOrder = [
    "seo-new-keyword-game-case-study",
    "geo-citation-recommendation-experiment",
    "xiaohongshu-plus-size-fashion-positioning",
    "xiaohongshu-founder-livestream-case-study",
    "content-compounding-founder-system",
    "reddit-growth-vote-manipulation-risk",
    "validate-demand-before-building",
    "reddit-shadowban-recovery-cases",
    "reddit-post-patterns-popsy-ai",
    "reddit-first-customers-manual-outreach"
  ];
  const orderedPosts = [...growthCaseStudyBlogPosts].sort(
    (a, b) => preferredOrder.indexOf(a.slug) - preferredOrder.indexOf(b.slug)
  );
  const [leadPost, ...otherPosts] = orderedPosts;
  const leadVisual = getBlogVisual(leadPost.slug);

  return (
    <>
      <main className="relative min-h-screen overflow-hidden bg-bg text-fg">
        <MarketingLandingTracker contentType="blog_index" locale={locale} />
        <div className="grain" aria-hidden />
        <PublicSiteHeader locale={locale} localeHref={isEn ? "/blog" : "/en/blog"} />

        <section className="mx-auto max-w-6xl px-5 pb-10 pt-10 sm:pb-14 sm:pt-16">
          <div className="max-w-4xl">
            <p className="eyebrow-mono flex items-center gap-2 text-brand">
              <BookOpenText className="h-3.5 w-3.5" />
              {isEn ? "FINFOLD CASE NOTES" : "FINFOLD 增长案例"}
            </p>
            <h1 className={`mt-5 text-balance text-4xl leading-[1.08] text-fg sm:text-6xl ${isEn ? "font-display" : "font-display-zh"}`}>
              {isEn ? "Real growth case studies" : "真实的增长博客案例分享"}
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-fg-muted sm:text-lg">
              {isEn
                ? "Learn how growth operators around the world do the work."
                : "学习全球的增长运营专家都是怎么做的。"}
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-12">
          <article className="grid overflow-hidden rounded-[1.75rem] border border-hairline bg-surface shadow-raised lg:grid-cols-[1.16fr_0.84fr]">
            <figure className="relative min-h-[20rem] overflow-hidden bg-surface-2 lg:min-h-[31rem]">
              <Image
                src={leadVisual.src}
                alt={isEn ? leadVisual.altEn : leadVisual.altZh}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 58vw"
                className="object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
              <figcaption className="absolute inset-x-5 bottom-5 max-w-2xl text-xs leading-5 text-white/85 sm:inset-x-7 sm:bottom-7">
                {isEn ? leadVisual.captionEn : leadVisual.captionZh}{" "}
                <a href={leadVisual.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-white underline decoration-white/45 underline-offset-4 hover:decoration-white">
                  {isEn ? leadVisual.sourceLabelEn : leadVisual.sourceLabelZh}
                </a>
              </figcaption>
            </figure>

            <div className="flex flex-col p-7 sm:p-10 lg:p-12">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded-full bg-brand/[0.1] px-3 py-1.5 font-semibold text-brand">{leadPost.platform}</span>
                <span className="text-fg-muted">{isEn ? `${leadPost.readingMinutes} min` : `${leadPost.readingMinutes} 分钟`}</span>
              </div>
              <h2 className={`mt-7 text-balance text-3xl leading-tight text-fg sm:text-4xl ${isEn ? "font-display" : "font-display-zh"}`}>
                {isEn ? leadPost.titleEn : leadPost.titleZh}
              </h2>
              <p className="mt-5 text-sm leading-7 text-fg-muted sm:text-base sm:leading-8">
                {isEn ? leadPost.descriptionEn : leadPost.descriptionZh}
              </p>
              <MarketingResourceLink
                href={`${prefix}/blog/${leadPost.slug}`}
                resourceType="blog"
                slug={leadPost.slug}
                surface="blog_index"
                locale={locale}
                className="focus-ring mt-auto inline-flex w-fit items-center gap-2 pt-8 text-sm font-semibold text-fg transition-colors hover:text-brand"
              >
                {isEn ? "Read article" : "阅读文章"}
                <ArrowRight className="h-4 w-4" />
              </MarketingResourceLink>
            </div>
          </article>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24 pt-4">
          <div className="mb-6 border-b border-hairline pb-4">
            <p className="eyebrow-mono">{isEn ? "MORE CASES" : "继续往下读"}</p>
            <h2 className={`mt-2 text-2xl text-fg sm:text-3xl ${isEn ? "font-display" : "font-display-zh"}`}>
              {isEn ? "The useful detail usually sits next to the inconvenient one." : "好用的细节，常常挨着不太体面的那一段。"}
            </h2>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {otherPosts.map((post) => {
              const visual = getBlogVisual(post.slug);
              return (
                <article key={post.slug} className="group overflow-hidden rounded-2xl border border-hairline bg-surface shadow-soft transition-transform duration-300 hover:-translate-y-1">
                  <figure className="relative aspect-[16/8.5] overflow-hidden bg-surface-2">
                    <Image
                      src={visual.src}
                      alt={isEn ? visual.altEn : visual.altZh}
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                    <figcaption className="absolute inset-x-5 bottom-4 text-[11px] leading-5 text-white/85">
                      {isEn ? visual.sourceLabelEn : visual.sourceLabelZh}
                    </figcaption>
                  </figure>
                  <div className="flex min-h-[20rem] flex-col p-6 sm:p-8">
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="font-semibold text-brand">{post.platform}</span>
                      <span className="text-fg-muted">{isEn ? `${post.readingMinutes} min` : `${post.readingMinutes} 分钟`}</span>
                    </div>
                    <h3 className={`mt-5 text-balance text-2xl leading-tight text-fg sm:text-[1.8rem] ${isEn ? "font-display" : "font-display-zh"}`}>
                      {isEn ? post.titleEn : post.titleZh}
                    </h3>
                    <p className="mt-4 text-sm leading-7 text-fg-muted">{isEn ? post.descriptionEn : post.descriptionZh}</p>
                    <MarketingResourceLink
                      href={`${prefix}/blog/${post.slug}`}
                      resourceType="blog"
                      slug={post.slug}
                      surface="blog_index"
                      locale={locale}
                      className="focus-ring mt-auto inline-flex w-fit items-center gap-2 pt-7 text-sm font-semibold text-fg transition-colors group-hover:text-brand"
                    >
                      {isEn ? "Read" : "阅读"}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </MarketingResourceLink>
                  </div>
                </article>
              );
            })}
          </div>

          <section className="mt-12 overflow-hidden rounded-2xl border border-brand/25 bg-brand/[0.06] p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow-mono text-brand">{isEn ? "BRING YOUR OWN MATERIAL" : "轮到你的材料"}</p>
                <h2 className={`mt-3 text-2xl text-fg sm:text-3xl ${isEn ? "font-display" : "font-display-zh"}`}>
                  {isEn ? "Run a source check before asking AI to write." : "先看看手里的事实够不够，再让 AI 动笔。"}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-muted">
                  {isEn
                    ? "The free tools look for a person, time, numbers, and consequences. You still verify the facts. Your source goes into the workbench intact."
                    : "免费工具会先找人物、时间、数字和后果线索，事实真假仍要由你核对。原材料会完整带进创作台，不用重新粘贴。"}
                </p>
              </div>
              <MarketingResourceLink
                href={`${prefix}/tools`}
                resourceType="tool"
                slug="tools-index"
                surface="blog_index"
                locale={locale}
                className="btn-primary focus-ring shrink-0"
              >
                {isEn ? "Check my source" : "检查我的材料"} <ArrowRight className="h-4 w-4" />
              </MarketingResourceLink>
            </div>
          </section>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
