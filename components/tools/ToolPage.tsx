"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, XCircle } from "@/components/ui/icons";
import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { TrackedCtaLink } from "@/components/marketing/TrackedCtaLink";
import { getPlatform } from "@/lib/platforms";
import { getStoredLocale } from "@/lib/theme";
import type { Locale } from "@/lib/i18n";
import {
  founderMarketingToolSlugs,
  toolPages,
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
  const platform = getPlatform(config.platform);

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
  const title = isEn ? config.heroEn : config.heroZh;
  const description = isEn ? config.searchDescriptionEn : config.searchDescriptionZh;
  const bestFor = isEn ? config.bestForEn : config.bestForZh;
  const outputs = isEn ? config.outputsEn : config.outputsZh;
  const prefix = isEn ? "/en" : "";
  const relatedTools = toolPages.filter((tool) => tool.slug !== config.slug).slice(0, 3);
  const linksToFounderGuide = founderMarketingToolSlugs.has(config.slug);

  return (
    <>
      <main className="min-h-screen bg-bg">
        <PublicSiteHeader locale={locale} localeHref={localeHref} />

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-5 pb-6 pt-8 sm:pt-14">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow justify-center">{platform.label}</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-fg sm:text-5xl">{title}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-fg-muted sm:text-base">{description}</p>
        </div>
      </section>

      {/* Public preview handoff. Generation itself stays account-gated in the workbench. */}
      <section className="mx-auto max-w-4xl px-5 pb-16">
        <div className="panel flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="eyebrow-mono text-action-strong dark:text-action">
              {isEn ? "PREVIEW BEFORE SIGN-IN" : "免登录预览"}
            </p>
            <h2 className="mt-2 text-xl font-bold text-fg">
              {isEn ? `Open the ${platform.label} workflow in Finfold` : `在 Finfold 中查看 ${platform.label} 工作流`}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-muted">
              {isEn
                ? "Explore the full workbench without an account. Sign in with a free account only when you are ready to generate."
                : "无需账户即可查看完整创作台；准备生成时再登录，免费账户即可使用。"}
            </p>
          </div>
          <TrackedCtaLink
            href={`/workbench?platform=${config.platform}`}
            sourceType="tool"
            sourceSlug={config.slug}
            destination="workbench_preview"
            locale={locale}
            className="btn-primary focus-ring inline-flex shrink-0 items-center gap-2 text-sm"
          >
            {isEn ? "Preview workbench" : "预览创作台"} <ArrowRight className="h-4 w-4" />
          </TrackedCtaLink>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-12">
        <div className="grid gap-5 md:grid-cols-2">
          <article className="panel p-6">
            <p className="eyebrow-mono text-brand">{isEn ? "BEST FOR" : "适合这些任务"}</p>
            <h2 className="mt-3 text-xl font-semibold text-fg">
              {isEn ? `When to use this ${config.titleEn.toLowerCase()}` : `什么时候适合用${config.titleZh}`}
            </h2>
            <ul className="mt-5 grid gap-3 text-sm leading-6 text-fg-muted">
              {bestFor.map((item) => (
                <li key={item} className="flex gap-3">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-brand" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="panel p-6">
            <p className="eyebrow-mono text-brand">{isEn ? "WHAT YOU GET" : "会得到什么"}</p>
            <h2 className="mt-3 text-xl font-semibold text-fg">
              {isEn ? "A draft you can review, not a black-box post" : "先拿到可检查、可修改的完整初稿"}
            </h2>
            <ul className="mt-5 grid gap-3 text-sm leading-6 text-fg-muted">
              {outputs.map((item) => (
                <li key={item} className="flex gap-3">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-brand" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      {config.relatedBlogSlug ? (
        <section className="mx-auto max-w-4xl px-5 pb-6">
          <Link
            href={`${prefix}/blog/${config.relatedBlogSlug}`}
            onClick={() => captureEvent("content_internal_link_clicked", {
              sourceType: "tool",
              sourceSlug: config.slug,
              destinationType: "blog_post",
              destinationSlug: config.relatedBlogSlug,
              locale
            })}
            className="panel panel-hover group flex flex-col gap-4 border-l-4 border-l-brand p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="eyebrow-mono text-brand">{isEn ? "BEFORE YOU GENERATE" : "生成之前，先听句实话"}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-fg">
                {isEn
                  ? `A generator can shape the ${platform.label} draft. The field note shows where the human judgment still belongs.`
                  : `工具能搭好 ${platform.label} 的架子，但哪里必须留下人味、判断和故事，我们写在这篇现场笔记里。`}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-brand">
              {isEn ? "Read the story" : "先读实战故事"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        </section>
      ) : null}

      {linksToFounderGuide ? (
        <section className="mx-auto max-w-4xl px-5 pb-6">
          <Link
            href={`${prefix}/use-cases/ai-marketing-for-founders`}
            onClick={() => captureEvent("content_internal_link_clicked", {
              sourceType: "tool",
              sourceSlug: config.slug,
              destinationType: "use_case",
              destinationSlug: "ai-marketing-for-founders",
              locale
            })}
            className="panel panel-hover group grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6"
          >
            <span>
              <span className="eyebrow-mono text-brand">
                {isEn ? "FOR FOUNDERS SHIPPING A PRODUCT" : "给正在发布产品的创始人"}
              </span>
              <span className="mt-2 block text-sm font-semibold leading-6 text-fg">
                {isEn
                  ? "Turn this one draft into an AI marketing workflow without handing away the facts or final judgment."
                  : "把这一篇草稿接入完整的 AI 营销工作流，同时保留事实与最终判断。"}
              </span>
            </span>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
              {isEn ? "Read the founder guide" : "阅读创始人指南"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        </section>
      ) : null}

      {/* Platform rules preview — the sellable IP, shown as proof */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="text-center text-2xl font-bold text-fg sm:text-3xl">
          {isEn ? `What survives in the ${platform.label} feed` : `${platform.label} 上，什么东西不容易被划走`}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-fg-muted">
          {isEn
            ? "These are working constraints, not eternal algorithm commandments. Every draft here starts from them; your own results get the final vote."
            : "这些是写作约束，不是永不过期的算法圣旨。每次生成先按它们起步，最后听你自己的数据。"}
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-fg">
              <CheckCircle2 className="h-4 w-4 text-brand" />
              {isEn ? "Worth trying" : "值得先这么试"}
            </div>
            <ul className="grid gap-2.5 text-sm leading-6 text-fg-muted">
              {platform.viralPatterns.slice(0, 4).map((pattern) => (
                <li key={pattern} className="flex gap-2">
                  <span className="text-brand">·</span>
                  <span>{pattern}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-fg">
              <XCircle className="h-4 w-4 text-risk" />
              {isEn ? "Usually smells wrong" : "通常一眼就不对劲"}
            </div>
            <ul className="grid gap-2.5 text-sm leading-6 text-fg-muted">
              {platform.avoidList.slice(0, 4).map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-risk">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-20" aria-labelledby="tool-faq-heading">
        <p className="eyebrow-mono text-brand">{isEn ? "QUICK ANSWERS" : "常见问题"}</p>
        <h2 id="tool-faq-heading" className="mt-3 max-w-3xl text-2xl font-bold text-fg sm:text-3xl">
          {isEn ? `Questions about the ${config.titleEn}` : `关于${config.titleZh}，先把这些说清楚`}
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {config.faq.map((item) => (
            <article key={item.questionEn} className="panel p-5">
              <h3 className="text-base font-semibold leading-6 text-fg">
                {isEn ? item.questionEn : item.questionZh}
              </h3>
              <p className="mt-3 text-sm leading-7 text-fg-muted">
                {isEn ? item.answerEn : item.answerZh}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-4xl px-5 py-16 text-center">
        <h2 className="text-2xl font-bold text-fg sm:text-3xl">
          {isEn ? "One honest source. Fourteen different rooms." : "同一个真实故事，进十四个不同的场子。"}
        </h2>
        <TrackedCtaLink
          href="/signup"
          sourceType="tool"
          sourceSlug={config.slug}
          destination="signup"
          locale={locale}
          className="btn-primary focus-ring mt-6 inline-flex items-center gap-2 text-sm"
        >
          {isEn ? "Sign up free" : "免费注册"} <ArrowRight className="h-4 w-4" />
        </TrackedCtaLink>
      </section>

        <section className="mx-auto max-w-5xl px-5 pb-16">
          <div className="border-t border-hairline pt-10">
            <h2 className="text-xl font-semibold text-fg">{isEn ? "More free generators" : "更多免费生成器"}</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {relatedTools.map((tool) => (
                <Link
                  key={tool.slug}
                  href={`${prefix}/tools/${tool.slug}`}
                  className="panel panel-hover p-4"
                >
                  <p className="text-sm font-semibold text-fg">{isEn ? tool.titleEn : tool.titleZh}</p>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-fg-muted">
                    {isEn ? tool.descriptionEn : tool.descriptionZh}
                  </p>
                </Link>
              ))}
            </div>
            <Link href={`${prefix}/blog`} className="mt-5 inline-flex text-sm font-semibold text-brand hover:underline">
              {isEn ? "Read the growth field notes" : "去增长博客看现场故事"}
            </Link>
            <span className="mx-3 text-hairline">/</span>
            <Link href={`${prefix}/tools`} className="mt-5 inline-flex text-sm font-semibold text-brand hover:underline">
              {isEn ? "See all free generators" : "查看全部免费生成器"}
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
