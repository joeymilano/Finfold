"use client";

import { ArrowRight } from "@/components/ui/icons";
import { useEffect } from "react";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { MarketingLandingTracker } from "@/components/marketing/MarketingLandingTracker";
import { MarketingResourceLink } from "@/components/marketing/MarketingResourceLink";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import { getLocalizedPlatformLabel } from "@/lib/platforms";
import { captureEvent } from "@/lib/posthog";
import { toolPages } from "@/lib/tool-pages";
import type { Locale } from "@/lib/i18n";

export function ToolsIndexView({ locale }: { locale: Locale }) {
  const isEn = locale === "en";
  const prefix = isEn ? "/en" : "";

  useEffect(() => {
    captureEvent("tools_index_view", { locale });
  }, [locale]);

  return (
    <>
      <main className="relative min-h-screen overflow-hidden bg-bg text-fg">
        <MarketingLandingTracker contentType="tools_index" locale={locale} />
        <div className="grain" aria-hidden />
        <PublicSiteHeader locale={locale} localeHref={isEn ? "/tools" : "/en/tools"} />

        <section className="mx-auto max-w-6xl px-5 pb-12 pt-14 sm:pb-16 sm:pt-24">
          <p className="eyebrow-mono text-brand">{isEn ? "FREE TOOLS" : "免费工具"}</p>
          <h1 className={`mt-5 max-w-4xl text-balance text-5xl leading-[1.02] text-fg sm:text-7xl ${isEn ? "font-display" : "font-display-zh"}`}>
            {isEn ? "Choose a platform. Start writing." : "选一个平台，开始写。"}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-fg-muted sm:text-lg">
            {isEn
              ? "Paste what you already have. Check it for free, then generate an editable draft."
              : "贴上现有材料，先免费检查，再生成一篇可以继续修改的初稿。"}
          </p>
          <p className="mt-4 flex items-center gap-2 text-xs text-fg-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />
            {isEn ? "The check stays in your browser. Sign in only when you generate." : "材料检查在浏览器完成，开始生成时再登录。"}
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24">
          <div className="border-b border-hairline pb-5">
            <h2 className={`text-2xl text-fg sm:text-3xl ${isEn ? "font-display" : "font-display-zh"}`}>
              {isEn ? "Where are you publishing?" : "你要发到哪里？"}
            </h2>
          </div>

          <div className="grid border-b border-hairline md:grid-cols-2 lg:grid-cols-3">
            {toolPages.map((tool, index) => (
              <article
                key={tool.slug}
                className="group relative border-hairline py-1 md:[&:nth-child(odd)]:border-r lg:border-r lg:[&:nth-child(3n)]:border-r-0"
              >
                <MarketingResourceLink
                  href={`${prefix}/tools/${tool.slug}`}
                  resourceType="tool"
                  slug={tool.slug}
                  surface="tools_index"
                  locale={locale}
                  className="focus-ring flex flex-col px-1 py-7 sm:min-h-[18rem] sm:px-7 sm:py-8"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-surface text-brand">
                      <PlatformGlyph platform={tool.platform} className="h-[1.125rem] w-[1.125rem]" />
                    </span>
                    <span className="font-display text-sm tabular text-fg-muted/45">0{index + 1}</span>
                  </div>

                  <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
                    {getLocalizedPlatformLabel(tool.platform, locale, true)}
                  </p>
                  <h3 className={`mt-2 text-2xl leading-tight text-fg ${isEn ? "font-display" : "font-display-zh"}`}>
                    {isEn ? tool.titleEn : tool.titleZh}
                  </h3>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-fg-muted">
                    {isEn ? tool.descriptionEn : tool.descriptionZh}
                  </p>

                  <span className="mt-auto inline-flex items-center gap-2 pt-7 text-sm font-semibold text-fg transition-colors group-hover:text-brand">
                    {isEn ? "Use tool" : "使用"}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </MarketingResourceLink>
              </article>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-5 border-t border-hairline pt-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={`text-xl text-fg ${isEn ? "font-display" : "font-display-zh"}`}>
                {isEn ? "Need several platforms at once?" : "想一次做多个平台？"}
              </p>
              <p className="mt-1 text-sm text-fg-muted">
                {isEn ? "Carry one source into the full workbench." : "把同一份材料带进完整创作台。"}
              </p>
            </div>
            <MarketingResourceLink
              href="/workbench"
              resourceType="tool"
              slug="full-workbench"
              surface="tools_index"
              locale={locale}
              className="btn-primary focus-ring shrink-0"
            >
              {isEn ? "Open workbench" : "打开创作台"} <ArrowRight className="h-4 w-4" />
            </MarketingResourceLink>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
