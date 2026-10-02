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
  title: "AI 增长运营员工｜替你自动经营增长 | Finfold",
  description: "Finfold 像营销专家一样诊断小红书、X、Reddit 账号与 Post，识别流量断点和高风险表达，生成专业行动报告，并为 14 个平台准备原生内容。",
  alternates: {
    canonical: "/",
    languages: { "zh-CN": "/", en: "/en", "x-default": "/" }
  },
  openGraph: {
    title: "AI 增长运营员工｜替你自动经营增长 | Finfold",
    description: "上传账号、Post 或后台数据，让 Finfold 诊断流量异常、限流风险和高风险表达，并给出可立即执行的专业报告。",
    url: "/",
    locale: "zh_CN",
    siteName: brand.name,
    type: "website",
    images: [brand.socialImage]
  },
  twitter: {
    card: "summary_large_image",
    title: "AI 增长运营员工｜替你自动经营增长 | Finfold",
    description: "像营销专家一样诊断账号与 Post，找出流量断点和高风险表达，再给出下一步行动。",
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
  // The canonical root URL always serves Chinese copy and matching JSON-LD;
  // the language menu navigates to the separately indexed English homepage.
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
      <LandingPage initialLocale="zh" localeHref="/en#stay" />
    </>
  );
}
