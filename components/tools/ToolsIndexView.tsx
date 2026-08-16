"use client";

import { ArrowRight, BookOpenText, Sparkles } from "@/components/ui/icons";
import React from "react";
import { useEffect } from "react";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { MarketingResourceLink } from "@/components/marketing/MarketingResourceLink";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import { brand } from "@/lib/brand";
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
        <div className="grain" aria-hidden />
        <PublicSiteHeader locale={locale} localeHref={isEn ? "/tools" : "/en/tools"} />

        <section className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 sm:pb-20 sm:pt-20">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-[min(92vw,760px)] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl"
          />
          <p className="eyebrow-mono">{isEn ? "Six free ways off the blank page" : "六个免费工具，先别跟空白页死磕"}</p>
          <h1 className="mt-4 max-w-4xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-fg sm:text-6xl">
            {isEn ? "You do not need a better prompt. You need a first draft with a pulse." : "你不缺一个更长的 prompt。你缺的是一版有心跳的初稿。"}
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-fg-muted sm:text-lg">
            {isEn
              ? `Paste the update you have been avoiding. ${brand.name} will shape it for the platform; you put the judgment, details, and lived experience back in.`
              : `把那条憋了半天、自己看着都嫌闷的产品更新丢进来。${brand.name} 负责平台结构，你把判断、细节和亲身经历放回去。`}
          </p>
          <p className="mt-4 max-w-2xl border-l-2 border-brand/60 pl-4 text-sm leading-7 text-fg-muted">
            {isEn ? "No universal copy. Only the right way to speak in the room you just entered." : "没有万能文案。进了不同的场子，就得用那个场子听得懂的话。"}
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {toolPages.map((tool, index) => (
              <article key={tool.slug} className="panel group relative flex min-h-[21rem] flex-col overflow-hidden rounded-2xl transition-transform duration-300 hover:-translate-y-1">
                <MarketingResourceLink
                  href={`${prefix}/tools/${tool.slug}`}
                  resourceType="tool"
                  slug={tool.slug}
                  surface="tools_index"
                  locale={locale}
                  className="focus-ring relative flex flex-1 flex-col p-6"
                >
                  <span className="absolute right-5 top-4 font-display text-6xl font-semibold text-brand/[0.09]">0{index + 1}</span>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/12 text-brand">
                    <PlatformGlyph platform={tool.platform} className="h-5 w-5" />
                  </span>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-brand">
                    {getLocalizedPlatformLabel(tool.platform, locale, true)}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold leading-tight text-fg">{isEn ? tool.titleEn : tool.titleZh}</h2>
                  <p className="mt-3 flex-1 text-sm leading-7 text-fg-muted">{isEn ? tool.descriptionEn : tool.descriptionZh}</p>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-fg transition-colors group-hover:text-brand">
                    {isEn ? "Write the first draft" : "先写出第一版"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </MarketingResourceLink>
                {tool.relatedBlogSlug ? (
                  <MarketingResourceLink
                    href={`${prefix}/blog/${tool.relatedBlogSlug}`}
                    resourceType="blog"
                    slug={tool.relatedBlogSlug}
                    surface="tools_index"
                    locale={locale}
                    className="focus-ring flex items-center gap-2 border-t border-hairline bg-surface-2/60 px-6 py-3.5 text-xs font-semibold text-fg-muted transition-colors hover:text-brand"
                  >
                    <BookOpenText className="h-3.5 w-3.5" />
                    {isEn ? "Read the field story first" : "不急着生成，先看一篇实战故事"}
                  </MarketingResourceLink>
                ) : null}
              </article>
            ))}
          </div>

          <div className="panel-inset mt-10 flex flex-col gap-5 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-brand"><Sparkles className="h-4 w-4" /> {isEn ? "One story, more than one room" : "一个故事，不止去一个场子"}</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-muted">
                {isEn ? "The full Workbench turns one honest source into different copy and visuals for 14 channels, generating up to 6 at a time without pretending every platform talks the same way." : "完整创作台会把同一份真实素材改成 14 个平台各自听得懂的文案和视觉，单次最多生成 6 个，不假装所有平台都说一种话。"}
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
              {isEn ? "Open the Workbench" : "打开完整创作台"} <ArrowRight className="h-4 w-4" />
            </MarketingResourceLink>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
