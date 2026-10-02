import Link from "next/link";
import { ArrowRight, Check, CircleDot } from "@/components/ui/icons";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { MarketingLandingTracker } from "@/components/marketing/MarketingLandingTracker";
import { TrackedCtaLink } from "@/components/marketing/TrackedCtaLink";
import { comparePages, type ComparePageConfig } from "@/lib/compare-pages";

export function ComparePage({ config }: { config: ComparePageConfig }) {
  const relatedPages = comparePages.filter((page) => page.slug !== config.slug);

  return (
    <>
      <main className="min-h-screen bg-bg">
        <MarketingLandingTracker contentType="other" contentSlug={config.slug} locale="en" />
        <PublicSiteHeader locale="en" />

        <section className="mx-auto max-w-5xl px-5 pb-14 pt-10 lg:pt-16">
          <p className="eyebrow">{config.eyebrow}</p>
          <h1 className="mt-4 max-w-3xl text-balance text-4xl font-bold leading-[1.08] text-fg sm:text-6xl">
            {config.h1}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-fg-muted">{config.directAnswer}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <TrackedCtaLink
              href="/signup"
              sourceType="landing"
              sourceSlug={`compare-${config.slug}`}
              destination="signup"
              locale="en"
              className="btn-primary focus-ring inline-flex items-center gap-2 px-5 py-3 text-sm"
            >
              Try Finfold free
              <ArrowRight className="h-4 w-4" />
            </TrackedCtaLink>
            <Link href="/en" className="btn-ghost focus-ring px-5 py-3 text-sm">
              See how Finfold works
            </Link>
          </div>
        </section>

        <section className="border-y border-hairline bg-bg-elevated/40">
          <div className="mx-auto grid max-w-5xl gap-4 px-5 py-14 md:grid-cols-2">
            <article className="panel p-6 sm:p-7">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-positive">
                {config.verdictFinfoldTitle}
              </p>
              <p className="mt-5 text-sm leading-7 text-fg-muted">{config.verdictFinfold}</p>
            </article>
            <article className="panel p-6 sm:p-7">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-brand">
                {config.verdictCompetitorTitle}
              </p>
              <p className="mt-5 text-sm leading-7 text-fg-muted">{config.verdictCompetitor}</p>
            </article>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16">
          <h2 className="text-3xl font-bold text-fg">Side by side</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-fg-muted">
            {config.competitorName} — {config.competitorLabel} — compared with Finfold, a reviewable
            AI marketing agent for small teams.
          </p>
          <div className="mt-8 overflow-x-auto border border-hairline">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-bg-elevated/60">
                  <th scope="col" className="px-5 py-4 font-semibold text-fg">
                    Dimension
                  </th>
                  <th scope="col" className="px-5 py-4 font-semibold text-brand">
                    Finfold
                  </th>
                  <th scope="col" className="px-5 py-4 font-semibold text-fg">
                    {config.competitorName}
                  </th>
                </tr>
              </thead>
              <tbody>
                {config.rows.map((row) => (
                  <tr key={row.dimension} className="border-b border-hairline last:border-b-0 align-top">
                    <th scope="row" className="px-5 py-4 font-medium text-fg">
                      {row.dimension}
                    </th>
                    <td className="px-5 py-4 leading-6 text-fg-muted">
                      <span className="flex items-start gap-2">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-brand" />
                        <span>{row.finfold}</span>
                      </span>
                    </td>
                    <td className="px-5 py-4 leading-6 text-fg-muted">
                      <span className="flex items-start gap-2">
                        <CircleDot className="mt-1 h-4 w-4 shrink-0 text-fg-subtle" />
                        <span>{row.competitor}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 pb-20">
          <h2 className="text-3xl font-bold text-fg">Frequently asked questions</h2>
          <div className="mt-6 grid gap-4">
            {config.faqs.map((faq) => (
              <article key={faq.question} className="panel p-6">
                <h3 className="text-base font-semibold text-fg">{faq.question}</h3>
                <p className="mt-3 text-sm leading-7 text-fg-muted">{faq.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-hairline px-5 py-14">
          <h2 className="text-xl font-semibold text-fg">More comparisons</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {relatedPages.map((page) => (
              <Link
                key={page.slug}
                href={`/en/compare/${page.slug}`}
                className="panel panel-hover block p-5"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-brand">
                  {page.competitorName}
                </span>
                <span className="mt-2 block text-lg font-semibold text-fg">{page.h1}</span>
                <span className="mt-2 block text-sm leading-6 text-fg-muted">
                  {page.description}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter locale="en" />
    </>
  );
}
