import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { AuthenticatedRedirect } from "@/components/landing/AuthenticatedRedirect";
import { brand } from "@/lib/brand";
import {
  buildFaqSchema,
  buildOrganizationSchema,
  buildSoftwareApplicationSchema,
  buildWebSiteSchema
} from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "AI 营销智能体｜小团队的第一位 AI 营销员工 | Finfold",
  description: "Finfold 审查你的网站，发现值得执行的增长机会，准备可审核的增长任务，为 14 个平台生成原生内容，并把真实结果带回下一轮。",
  alternates: {
    canonical: "/",
    languages: { "zh-CN": "/", en: "/en", "x-default": "/" }
  },
  openGraph: {
    title: "AI 营销智能体｜小团队的第一位 AI 营销员工 | Finfold",
    description: "从网站诊断到可审核的增长任务、平台原生内容与结果复盘，Finfold 帮小团队把 AI 营销变成持续工作流。",
    url: "/",
    locale: "zh_CN",
    siteName: brand.name,
    type: "website",
    images: [brand.socialImage]
  },
  twitter: {
    card: "summary_large_image",
    title: "AI 营销智能体｜小团队的第一位 AI 营销员工 | Finfold",
    description: "发现增长机会，准备任务，人工审核后执行，并用真实结果改进下一轮。",
    images: [brand.socialImage.url]
  }
};

/**
 * Landing page — STATICALLY pre-rendered for SEO.
 *
 * This page intentionally does NOT read cookies or call Supabase auth on the
 * server. Doing so (via next/headers `cookies()` + `supabase.auth.getUser()`)
 * forces Next.js into dynamic rendering, which prevents a pre-rendered
 * index.html from being emitted — leaving crawlers (especially Baidu, which
 * does not run JavaScript) with an empty shell and no indexable content.
 *
 * Authenticated visitors are redirected client-side by <AuthenticatedRedirect />
 * after hydration. See that component for the reasoning.
 *
 * The page deliberately has no forced runtime so Next.js emits it as a static
 * asset, which also makes it faster for crawlers to fetch.
 */
export default function HomePage() {
  // Locale is chosen client-side after hydration (cookie/localStorage), so
  // this server-rendered JSON-LD defaults to the same "zh" the app defaults
  // to before any locale preference is known (see lib/theme.ts DEFAULT_LOCALE).
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildWebSiteSchema()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildOrganizationSchema()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildSoftwareApplicationSchema("zh")) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqSchema("zh")) }}
      />
      <AuthenticatedRedirect />
      <LandingPage initialLocale="zh" localeHref="/en" />
    </>
  );
}
