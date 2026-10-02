"use client";

import Link from "next/link";
import { ArrowRight } from "@/components/ui/icons";
import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { ToolSourceClinic } from "@/components/tools/ToolSourceClinic";
import { getLocalizedPlatformLabel } from "@/lib/platforms";
import { getStoredLocale } from "@/lib/theme";
import type { Locale } from "@/lib/i18n";
import {
  founderMarketingToolSlugs,
  getRelatedToolPages,
  type ToolPageConfig
} from "@/lib/tool-pages";
import { captureEvent } from "@/lib/posthog";

export function ToolPage({
  config,
  initialLocale,
  localeHref
}: {
  config: ToolPageConfig;
  initialLocale?: Locale;
  localeHref?: string;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale ?? "zh");

  useEffect(() => {
    if (!initialLocale) {
      setLocale(getStoredLocale());
    }
    captureEvent("landing_view", {
      tool: config.slug,
      contentType: "tool",
      contentSlug: config.slug,
      locale: initialLocale ?? getStoredLocale()
    });
    function onLocaleChange(e: Event) {
      if (!initialLocale) {
        setLocale((e as CustomEvent<Locale>).detail);
      }
    }
    window.addEventListener("finfold-locale-change", onLocaleChange);
    return () => window.removeEventListener("finfold-locale-change", onLocaleChange);
  }, [config.slug, initialLocale]);

  const isEn = locale === "en";
  const platformLabel = getLocalizedPlatformLabel(config.platform, locale);
  const title = isEn ? config.heroEn : config.heroZh;
  const description = isEn ? config.directAnswerEn : config.directAnswerZh;
  const bestFor = isEn ? config.bestForEn : config.bestForZh;
  const outputs = isEn ? config.outputsEn : config.outputsZh;
  const prefix = isEn ? "/en" : "";
  const relatedTools = getRelatedToolPages(config.slug);
  const linksToFounderGuide = founderMarketingToolSlugs.has(config.slug);

  return (
    <>
      <main className="relative min-h-screen overflow-hidden bg-bg text-fg">
        <div className="grain" aria-hidden />
        <PublicSiteHeader locale={locale} localeHref={localeHref} />

        <section className="mx-auto max-w-6xl px-5 pb-9 pt-12 sm:pb-12 sm:pt-20">
          <p className="eyebrow-mono text-brand">{platformLabel}</p>
          <h1 className={`mt-5 max-w-5xl text-balance text-5xl leading-[1.02] text-fg sm:text-7xl ${isEn ? "font-display" : "font-display-zh"}`}>
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-fg-muted sm:text-lg">
            {description}
          </p>
        </section>

        <ToolSourceClinic config={config} locale={locale} />

        {isEn ? (
          <aside className="mx-auto max-w-6xl px-5 pb-10 text-sm leading-6 text-fg-muted">
            <p>
              Need to adapt the same update for more than one channel?{" "}
              <Link href="/en/compare/multi-channel" className="focus-ring underline underline-offset-4">
                Compare a multi-channel workflow with separate writing tools
              </Link>{" "}
              and see where human review fits.
            </p>
          </aside>
        ) : null}

        <section className="mx-auto max-w-6xl px-5 pb-16">
          <div className="pb-8">
            <h2 className={`text-2xl text-fg ${isEn ? "font-display" : "font-display-zh"}`}>
              {isEn ? "When to use this tool" : "适合哪些内容"}
            </h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-fg-muted">
              {bestFor.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="border-y border-hairline py-8">
            <p className="eyebrow-mono text-brand">{isEn ? "OUTPUT" : "你会得到"}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {outputs.map((item, index) => (
                <div key={item} className="flex gap-3 text-sm leading-6 text-fg-muted">
                  <span className="font-display text-brand/70">0{index + 1}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 pb-16" aria-labelledby="tool-faq-heading">
          <h2 id="tool-faq-heading" className={`text-3xl text-fg sm:text-4xl ${isEn ? "font-display" : "font-display-zh"}`}>
            {isEn ? "Common questions" : "常见问题"}
          </h2>
          <div className="mt-6 border-t border-hairline">
            {config.faq.map((item) => (
              <details key={item.questionEn} className="group border-b border-hairline">
                <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-left text-base font-semibold text-fg [&::-webkit-details-marker]:hidden">
                  <span>{isEn ? item.questionEn : item.questionZh}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-fg-muted transition-transform group-open:rotate-90" />
                </summary>
                <p className="max-w-2xl pb-5 pr-10 text-sm leading-7 text-fg-muted">
                  {isEn ? item.answerEn : item.answerZh}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24">
          <div className="border-t border-hairline pt-8">
            <div className="flex items-end justify-between gap-5">
              <h2 className={`text-2xl text-fg ${isEn ? "font-display" : "font-display-zh"}`}>
                {isEn ? "More free tools" : "其他免费工具"}
              </h2>
              <div className="flex flex-wrap justify-end gap-x-4 gap-y-2 text-sm font-semibold text-brand">
                {linksToFounderGuide ? (
                  <Link
                    href={`${prefix}/use-cases/ai-marketing-for-founders`}
                    onClick={() => captureEvent("content_internal_link_clicked", {
                      sourceType: "tool",
                      sourceSlug: config.slug,
                      destinationType: "use_case",
                      destinationSlug: "ai-marketing-for-founders",
                      locale
                    })}
                    className="hover:underline"
                  >
                    {isEn ? "Founder guide" : "创始人营销指南"}
                  </Link>
                ) : null}
                <Link href={`${prefix}/tools`} className="hover:underline">
                  {isEn ? "View all" : "查看全部"}
                </Link>
              </div>
            </div>
            <div className="mt-5 grid border-y border-hairline md:grid-cols-3">
              {relatedTools.map((tool) => (
                <Link
                  key={tool.slug}
                  href={`${prefix}/tools/${tool.slug}`}
                  className="focus-ring group flex items-center justify-between gap-4 border-b border-hairline py-5 text-sm font-semibold text-fg transition-colors hover:text-brand md:border-b-0 md:border-r md:px-5 md:first:pl-0 md:last:border-r-0"
                >
                  <span>{isEn ? tool.titleEn : tool.titleZh}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
