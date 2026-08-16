import Image from "next/image";
import { ArrowRight, Coffee, PenLine } from "@/components/ui/icons";
import { blogPosts } from "@/lib/blog-posts";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { MarketingResourceLink } from "@/components/marketing/MarketingResourceLink";
import type { Locale } from "@/lib/i18n";

export function BlogIndexView({ locale }: { locale: Locale }) {
  const isEn = locale === "en";
  const prefix = isEn ? "/en" : "";

  return (
    <>
      <main className="relative min-h-screen overflow-hidden bg-bg text-fg">
        <div className="grain" aria-hidden />
        <PublicSiteHeader locale={locale} localeHref={isEn ? "/blog" : "/en/blog"} />

        <section className="mx-auto max-w-6xl px-5 pb-12 pt-8 sm:pt-14">
          <div className="grid items-end gap-8 lg:grid-cols-[0.82fr_1.18fr]">
            <div className="pb-2">
              <p className="eyebrow-mono flex items-center gap-2">
                <PenLine className="h-3.5 w-3.5 text-brand" />
                {isEn ? "FINFOLD GROWTH FIELD NOTES" : "FINFOLD 增长现场"}
              </p>
              <h1 className={`mt-5 text-balance text-4xl leading-[1.06] text-fg sm:text-6xl ${isEn ? "font-display" : "font-display-zh"}`}>
                {isEn ? "Growth is a pile of ugly drafts." : "增长不是玄学，是一堆难看的草稿。"}
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-fg-muted">
                {isEn
                  ? "No secret algorithm switches. Just field stories, wrong calls, and small experiments you can run before the coffee goes cold."
                  : "这里不贩卖算法内幕，也不拿十条万能公式糊弄你。只写我们见过的烂稿、踩过的坑，以及咖啡凉掉之前就能试的小实验。"}
              </p>
              <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-fg">
                <Coffee className="h-4 w-4 text-brand" />
                {isEn ? "Written for people who still have to ship the product tomorrow." : "写给那些明天还得继续做产品的人。"}
              </p>
            </div>

            <figure className="relative overflow-hidden rounded-[1.75rem] border border-hairline bg-surface shadow-raised">
              <Image
                src="/editorial/growth-field-notes.webp"
                alt={isEn ? "A founder revising content drafts late at night" : "深夜修改内容草稿的独立开发者"}
                width={1792}
                height={1008}
                priority
                className="aspect-[16/10] w-full object-cover"
              />
              <figcaption className="absolute inset-x-4 bottom-4 rounded-xl border border-white/10 bg-black/70 px-4 py-3 text-xs leading-5 text-white/80 backdrop-blur-md sm:left-auto sm:max-w-xs">
                {isEn
                  ? "01:13 a.m. The seventh opening was deleted. The eighth finally sounded like a person."
                  : "凌晨 1:13，删掉第七版开头。第八版终于像个人说的话。"}
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24 pt-8">
          <div className="mb-5 flex items-end justify-between gap-4 border-b border-hairline pb-4">
            <div>
              <p className="eyebrow-mono">{isEn ? "LATEST DISPATCHES" : "最近几篇"}</p>
              <h2 className="mt-2 text-2xl font-semibold text-fg">{isEn ? "Notes from the field" : "从现场带回来的东西"}</h2>
            </div>
            <span className="hidden text-xs text-fg-muted sm:block">{isEn ? "No guru voice. No guarantees." : "不装大师，不打包票。"}</span>
          </div>

          <div className="grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline lg:grid-cols-2">
            {blogPosts.map((post, index) => (
              <article key={post.slug} className="group relative flex min-h-[23rem] flex-col bg-surface p-6 transition-colors hover:bg-surface-2 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">{post.platform}</p>
                    <p className="mt-2 text-xs text-fg-muted">
                      {isEn ? `Field note 0${index + 1} · ${post.readingMinutes} min` : `增长现场 0${index + 1} · ${post.readingMinutes} 分钟`}
                    </p>
                  </div>
                  <span className="font-display text-6xl leading-none text-brand/[0.12]">0{index + 1}</span>
                </div>

                <h3 className={`mt-8 max-w-xl text-balance text-2xl leading-tight text-fg sm:text-[2rem] ${isEn ? "font-display" : "font-display-zh"}`}>
                  {isEn ? post.titleEn : post.titleZh}
                </h3>
                <p className="mt-4 max-w-xl text-sm leading-7 text-fg-muted">{isEn ? post.descriptionEn : post.descriptionZh}</p>

                <MarketingResourceLink
                  href={`${prefix}/blog/${post.slug}`}
                  resourceType="blog"
                  slug={post.slug}
                  surface="blog_index"
                  locale={locale}
                  className="focus-ring mt-auto inline-flex w-fit items-center gap-2 pt-8 text-sm font-semibold text-fg transition-colors group-hover:text-brand"
                >
                  {isEn ? "Read the field note" : "坐下来，听我讲完"}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </MarketingResourceLink>
              </article>
            ))}
          </div>

          <section className="mt-12 overflow-hidden rounded-2xl border border-brand/25 bg-brand/[0.06] p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow-mono text-brand">{isEn ? "FROM READING TO SHIPPING" : "别只看，动手试"}</p>
                <h2 className={`mt-3 text-2xl text-fg sm:text-3xl ${isEn ? "font-display" : "font-display-zh"}`}>
                  {isEn ? "Take one rough product update. Make it sound alive." : "拿一条你自己都嫌闷的产品更新，救它一次。"}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-muted">
                  {isEn
                    ? "The free generators apply the platform rules. You keep the judgment, scars, and point of view."
                    : "免费工具负责平台结构，你负责留下判断、代价和那点不肯随大流的东西。"}
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
                {isEn ? "Open the free tools" : "去免费工具试一把"} <ArrowRight className="h-4 w-4" />
              </MarketingResourceLink>
            </div>
          </section>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
