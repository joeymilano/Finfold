import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check, CircleDot } from "@/components/ui/icons";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { MarketingLandingTracker } from "@/components/marketing/MarketingLandingTracker";
import { TrackedCtaLink } from "@/components/marketing/TrackedCtaLink";
import { useCasePages, type UseCasePageConfig } from "@/lib/use-case-pages";

export function UseCasePage({
  config,
  locale
}: {
  config: UseCasePageConfig;
  locale: "zh" | "en";
}) {
  const isEn = locale === "en";
  const prefix = isEn ? "/en" : "";
  const relatedPages = useCasePages.filter((page) => page.slug !== config.slug);
  const problems = isEn ? config.problemsEn : config.problemsZh;
  const outputs = isEn ? config.outputsEn : config.outputsZh;
  const outcomes = isEn ? config.outcomesEn : config.outcomesZh;
  const introParagraphs = (isEn ? config.introEn : config.introZh).split("\n\n");
  const guide = config.searchGuide;

  return (
    <>
      <main className="min-h-screen bg-bg">
        <MarketingLandingTracker contentType="use_case" contentSlug={config.slug} locale={locale} />
        <PublicSiteHeader
          locale={locale}
          localeHref={isEn ? `/use-cases/${config.slug}` : `/en/use-cases/${config.slug}`}
        />

        <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:pt-16">
          <div>
            <p className="eyebrow">{isEn ? config.eyebrowEn : config.eyebrowZh}</p>
            <h1 className="mt-4 max-w-3xl text-balance text-4xl font-bold leading-[1.08] text-fg sm:text-6xl">
              {isEn ? config.heroEn : config.heroZh}
            </h1>
            <p className="mt-5 text-sm font-semibold text-brand">
              {isEn ? config.sceneLabelEn : config.sceneLabelZh}
            </p>
            <div className="mt-6 max-w-2xl space-y-4 text-base leading-8 text-fg-muted">
              {introParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <blockquote className="mt-7 max-w-2xl border-l-2 border-brand pl-4 text-lg font-medium italic leading-8 text-fg">
              {isEn ? config.quoteEn : config.quoteZh}
            </blockquote>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <TrackedCtaLink
                href="/signup"
                sourceType="use_case"
                sourceSlug={config.slug}
                destination="signup"
                locale={locale}
                className="btn-primary focus-ring inline-flex items-center gap-2 px-5 py-3 text-sm"
              >
                {isEn ? "Start with your next update" : "从下一条更新开始"}
                <ArrowRight className="h-4 w-4" />
              </TrackedCtaLink>
              <Link href={`${prefix}/use-cases`} className="btn-ghost focus-ring px-5 py-3 text-sm">
                {isEn ? "See all use cases" : "查看全部使用场景"}
              </Link>
            </div>
          </div>

          <figure className="overflow-hidden border border-hairline bg-bg-elevated shadow-2xl shadow-black/20">
            <div className="relative aspect-[16/10] overflow-hidden">
              <Image
                src={config.image}
                alt={isEn ? config.imageAltEn : config.imageAltZh}
                fill
                priority
                sizes="(min-width: 1024px) 54vw, 100vw"
                className="object-cover"
              />
            </div>
            <figcaption className="grid gap-2 border-t border-hairline px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <span className="text-xs leading-5 text-fg-subtle">
                {isEn ? config.disclosureEn : config.disclosureZh}
              </span>
              <span className="font-mono text-[11px] text-risk">
                {isEn ? config.timeCostEn : config.timeCostZh}
              </span>
            </figcaption>
          </figure>
        </section>

        {guide ? (
          <section className="border-y border-hairline bg-bg-elevated/40">
            <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
              <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
                <div className="lg:sticky lg:top-24">
                  <p className="eyebrow">{isEn ? "The useful definition" : "先把这件事说清楚"}</p>
                  <h2 className="mt-3 text-balance text-3xl font-bold leading-tight text-fg sm:text-4xl">
                    {isEn ? guide.definitionTitleEn : guide.definitionTitleZh}
                  </h2>
                  <p className="mt-5 text-sm leading-7 text-fg-muted sm:text-base">
                    {isEn ? guide.definitionBodyEn : guide.definitionBodyZh}
                  </p>
                </div>
                <div className="grid gap-px overflow-hidden border border-hairline bg-hairline sm:grid-cols-2">
                  {guide.principles.map((item, index) => (
                    <article key={item.titleEn} className="bg-bg p-6 sm:p-7">
                      <span className="font-mono text-[11px] text-brand">0{index + 1}</span>
                      <h3 className="mt-3 text-lg font-semibold leading-snug text-fg">
                        {isEn ? item.titleEn : item.titleZh}
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-fg-muted">
                        {isEn ? item.bodyEn : item.bodyZh}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className={`mx-auto grid max-w-5xl gap-4 px-5 ${guide ? "py-20" : "pb-20"} md:grid-cols-[0.9fr_1.1fr]`}>
          <div className="panel p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              {isEn ? config.inputLabelEn : config.inputLabelZh}
            </p>
            <p className="mt-4 text-base leading-7 text-fg">
              “{isEn ? config.inputExampleEn : config.inputExampleZh}”
            </p>
          </div>
          <div className="panel-inset p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              {isEn ? config.outputLabelEn : config.outputLabelZh}
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {outputs.map((output) => (
                <li key={output} className="flex items-start gap-2 text-sm leading-6 text-fg-muted">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-brand" />
                  <span>{output}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-y border-hairline bg-bg-elevated/40">
          <div className="mx-auto grid max-w-5xl gap-10 px-5 py-16 md:grid-cols-[0.8fr_1.2fr] md:items-start">
            <div>
              <p className="eyebrow">{isEn ? "Where the day gets stuck" : "这一天，卡在了哪里"}</p>
              <h2 className="mt-3 text-3xl font-bold leading-tight text-fg">
                {isEn ? "They are not bad at writing. They are tired of rebuilding the same context." : "他们不是不会写，只是受够了每次都从头解释。"}
              </h2>
            </div>
            <ul className="grid gap-3">
              {problems.map((problem) => (
                <li key={problem} className="panel flex items-start gap-3 p-4 text-sm leading-6 text-fg-muted">
                  <CircleDot className="mt-1 h-4 w-4 shrink-0 text-risk" />
                  <span>{problem}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-20">
          <p className="eyebrow">{isEn ? "After Finfold steps in" : "Finfold 接手之后"}</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-fg sm:text-4xl">
            {isEn ? "The day can keep moving without sanding away the human judgment." : "不是让 AI 接管判断，是把最磨人的重复活接过去。"}
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {config.steps.map((step, index) => (
              <article key={step.titleEn} className="panel p-6">
                <span className="font-mono text-xs text-brand">0{index + 1}</span>
                <h3 className="mt-3 text-xl font-semibold text-fg">{isEn ? step.titleEn : step.titleZh}</h3>
                <p className="mt-3 text-sm leading-7 text-fg-muted">{isEn ? step.bodyEn : step.bodyZh}</p>
              </article>
            ))}
          </div>
        </section>

        {guide ? (
          <section className="mx-auto max-w-5xl px-5 pb-20">
            <div className="border-y border-hairline py-12 sm:py-16">
              <p className="eyebrow">{isEn ? "A decision, not a default" : "先判断，再自动化"}</p>
              <h2 className="mt-3 max-w-4xl text-balance text-3xl font-bold leading-tight text-fg sm:text-4xl">
                {isEn ? guide.decisionTitleEn : guide.decisionTitleZh}
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-8 text-fg-muted">
                {isEn ? guide.decisionIntroEn : guide.decisionIntroZh}
              </p>
              <div className="mt-9 grid gap-4 md:grid-cols-2">
                <article className="panel p-6 sm:p-7">
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-positive">
                    {isEn ? "GOOD FIT" : "适合现在就用"}
                  </p>
                  <ul className="mt-5 grid gap-4">
                    {(isEn ? guide.goodFitEn : guide.goodFitZh).map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm leading-6 text-fg-muted">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-positive" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
                <article className="panel p-6 sm:p-7">
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-risk">
                    {isEn ? "FIX THIS FIRST" : "先别急着放大"}
                  </p>
                  <ul className="mt-5 grid gap-4">
                    {(isEn ? guide.poorFitEn : guide.poorFitZh).map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm leading-6 text-fg-muted">
                        <CircleDot className="mt-1 h-4 w-4 shrink-0 text-risk" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
              <p className="mt-4 border-l-2 border-brand bg-brand/[0.05] px-5 py-4 text-sm leading-7 text-fg-muted">
                {isEn ? guide.guardrailEn : guide.guardrailZh}
              </p>
            </div>
          </section>
        ) : null}

        <section className="mx-auto max-w-5xl px-5 pb-20">
          <div className="panel-inset grid gap-8 p-7 md:grid-cols-[0.85fr_1.15fr] md:p-10">
            <div>
              <p className="eyebrow">{isEn ? "What actually changes" : "真正改变的，不只是条数"}</p>
              <h2 className="mt-3 text-2xl font-bold text-fg">
                {isEn ? "A smaller team gets some of its attention — and its evening — back." : "团队还是那么小，但晚上终于不用总交给内容。"}
              </h2>
            </div>
            <ul className="grid gap-3">
              {outcomes.map((outcome) => (
                <li key={outcome} className="flex items-start gap-3 text-sm leading-6 text-fg-muted">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-brand" />
                  <span>{outcome}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 pb-20">
          <h2 className="text-3xl font-bold text-fg">{isEn ? "Frequently asked questions" : "常见问题"}</h2>
          <div className="mt-6 grid gap-4">
            {config.faqs.map((faq) => (
              <article key={faq.questionEn} className="panel p-6">
                <h3 className="text-base font-semibold text-fg">{isEn ? faq.questionEn : faq.questionZh}</h3>
                <p className="mt-3 text-sm leading-7 text-fg-muted">{isEn ? faq.answerEn : faq.answerZh}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-hairline px-5 py-14">
          <h2 className="text-xl font-semibold text-fg">{isEn ? "Related use cases" : "相关使用场景"}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {relatedPages.map((page) => (
              <Link key={page.slug} href={`${prefix}/use-cases/${page.slug}`} className="panel panel-hover group overflow-hidden">
                <span className="relative block aspect-[16/8] overflow-hidden border-b border-hairline">
                  <Image
                    src={page.image}
                    alt={isEn ? page.imageAltEn : page.imageAltZh}
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover transition duration-500 group-hover:scale-[1.025]"
                  />
                </span>
                <span className="block p-5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-brand">
                    {isEn ? page.eyebrowEn : page.eyebrowZh}
                  </span>
                  <span className="mt-2 block text-lg font-semibold text-fg">{isEn ? page.titleEn : page.titleZh}</span>
                  <span className="mt-2 block text-sm leading-6 text-fg-muted">{isEn ? page.descriptionEn : page.descriptionZh}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
