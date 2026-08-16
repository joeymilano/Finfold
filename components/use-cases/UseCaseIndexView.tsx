import Image from "next/image";
import { ArrowRight } from "@/components/ui/icons";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { MarketingResourceLink } from "@/components/marketing/MarketingResourceLink";
import { useCasePages } from "@/lib/use-case-pages";

export function UseCaseIndexView({ locale }: { locale: "zh" | "en" }) {
  const isEn = locale === "en";
  const prefix = isEn ? "/en" : "";

  return (
    <>
      <main className="min-h-screen bg-bg">
        <PublicSiteHeader locale={locale} localeHref={isEn ? "/use-cases" : "/en/use-cases"} />

        <section className="mx-auto max-w-6xl px-5 pb-24 pt-12 sm:pt-16">
          <p className="eyebrow">{isEn ? "Not personas. Real moments." : "不是用户画像，是他们真实的一天"}</p>
          <h1 className="mt-3 max-w-4xl text-balance text-4xl font-bold leading-tight text-fg sm:text-6xl">
            {isEn ? "Three people. Three moments when content follows them home." : "三种人，三个被内容追着跑的时刻。"}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-fg-muted">
            {isEn
              ? "A blank launch post after midnight. One essay waiting to be rewritten four times. Two markets pulling one product apart. These composite stories show the work Finfold is meant to take off your desk."
              : "凌晨上线后还空着的发布稿、一个人改第四个平台、仓库开门前还没对齐的新品首发。这里不讲抽象画像，只讲那一刻手边到底乱成了什么样。"}
          </p>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {useCasePages.map((page, index) => (
              <MarketingResourceLink
                key={page.slug}
                href={`${prefix}/use-cases/${page.slug}`}
                resourceType="use_case"
                slug={page.slug}
                surface="use_cases_index"
                locale={locale}
                className="panel panel-hover group flex min-h-full flex-col overflow-hidden"
              >
                <span className="relative block aspect-[16/10] overflow-hidden border-b border-hairline bg-bg-inset">
                  <Image
                    src={page.image}
                    alt={isEn ? page.imageAltEn : page.imageAltZh}
                    fill
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="object-cover transition duration-500 group-hover:scale-[1.025]"
                  />
                  <span className="absolute left-4 top-4 bg-bg/90 px-2.5 py-1 font-mono text-[11px] text-brand backdrop-blur">
                    0{index + 1}
                  </span>
                </span>
                <span className="flex flex-1 flex-col p-6">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                    {isEn ? page.eyebrowEn : page.eyebrowZh}
                  </span>
                  <span className="mt-3 block text-balance text-xl font-semibold leading-snug text-fg">
                    {isEn ? page.titleEn : page.titleZh}
                  </span>
                  <span className="mt-3 block text-sm leading-7 text-fg-muted">
                    {isEn ? page.descriptionEn : page.descriptionZh}
                  </span>
                  <span className="mt-5 block border-l-2 border-brand/60 pl-3 text-sm italic leading-6 text-fg/80">
                    {isEn ? page.quoteEn : page.quoteZh}
                  </span>
                  <span className="mt-auto flex items-center gap-2 pt-6 text-sm font-semibold text-brand">
                    {isEn ? "Walk through this day" : "走进这一天"}
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </span>
                </span>
              </MarketingResourceLink>
            ))}
          </div>

          <p className="mt-8 max-w-3xl text-xs leading-6 text-fg-subtle">
            {isEn
              ? "All three are composite scenarios created to make common workflows concrete. They are not customer testimonials."
              : "以上均为复合场景，用来把常见工作流讲具体；它们不是客户证言，也不对应某个真实用户。"}
          </p>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
