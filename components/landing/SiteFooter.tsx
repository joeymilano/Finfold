"use client";

import Link from "next/link";
import { brand } from "@/lib/brand";
import { useLocale } from "@/hooks/useLocale";
import { BeianNotice } from "@/components/BeianNotice";
import { FishLogo } from "@/components/app-shell/FishLogo";
import type { Locale } from "@/lib/i18n";

/**
 * Site footer with the compliance links (Privacy, Terms, Refund) and a
 * contact address. Required to be accessible from the marketing pages before
 * a payment processor will approve the account for live charges.
 */
export function SiteFooter({ locale: localeOverride }: { locale?: Locale } = {}) {
  const storedLocale = useLocale();
  const locale = localeOverride ?? storedLocale;
  const publicPrefix = locale === "en" ? "/en" : "";

  const links = [
    { href: `${publicPrefix}/guide`, label: { en: "Guide", zh: "使用手册" } },
    { href: `${publicPrefix}/use-cases`, label: { en: "Use cases", zh: "使用场景" } },
    { href: `${publicPrefix}/blog`, label: { en: "Growth field notes", zh: "增长博客" } },
    { href: `${publicPrefix}/tools`, label: { en: "Free generators", zh: "免费生成器" } },
    { href: "/for-agents", label: { en: "For agents", zh: "Agent 接入" } },
    { href: "/extension/download", label: { en: "Chrome extension", zh: "Chrome 插件" } },
    { href: "/privacy", label: { en: "Privacy Policy", zh: "隐私政策" } },
    { href: "/terms", label: { en: "Terms of Service", zh: "服务条款" } },
    { href: "/refund", label: { en: "Refund Policy", zh: "退款政策" } },
    { href: "/support", label: { en: "Support", zh: "支持" } }
  ] as const;

  return (
    <footer className="relative overflow-hidden border-t border-hairline">
      {/* gradient hairline echoing the final-CTA horizon */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-[15%] top-0 h-px bg-gradient-to-r from-transparent via-brand/35 to-transparent"
      />
      {/* The studio's sign painted on the floor — a giant watermark wordmark
          behind the footer content, per docs/design-redesign-2026.md §3.4. */}
      <span aria-hidden className="floor-watermark absolute -bottom-[0.14em] left-1/2 -translate-x-1/2 whitespace-nowrap text-[20vw] sm:text-[14vw]">
        Finfold
      </span>
      <div className="relative mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <FishLogo variant="app-icon" className="h-5 w-5 rounded-[22%]" />
            <span className="text-sm font-semibold text-fg">Finfold</span>
            {locale === "zh" ? <span className="brand-cn text-xs text-fg-muted">{brand.chineseName}</span> : null}
            <span className="text-xs text-fg-muted">
              {locale === "en"
                ? "— one idea every platform always on brand"
                : "— 一个想法 全平台发布 始终是品牌自己的声音"}
            </span>
          </div>
          <a
            href="https://goodaitools.com/ai/finfold"
            target="_blank"
            rel="noopener"
            className="focus-ring w-fit shrink-0 rounded-md"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Good AI Tools verifies its exact external badge markup. */}
            <img
              src="https://goodaitools.com/assets/images/badge-dark.png"
              alt="Good AI Tools"
              height="54"
              loading="lazy"
              className="h-[54px] w-auto"
            />
          </a>
        </div>
        <div className="mt-5 flex flex-col gap-4 border-t border-hairline/60 pt-5 text-xs text-fg-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {brand.legal.entity}. {locale === "en" ? "All rights reserved." : "保留所有权利。"}{" "}
            <span className="opacity-60">v{process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}</span>
          </p>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="focus-ring rounded transition-colors hover:text-fg">
                {link.label[locale]}
              </Link>
            ))}
            <a href={`mailto:${brand.legal.contactEmail}`} className="focus-ring rounded transition-colors hover:text-fg">
              {brand.legal.contactEmail}
            </a>
          </nav>
        </div>
        {/* 国内站（www.finfold.cn）备案号；全球站构建未注入时为空。 */}
        <BeianNotice className="mt-4 justify-center text-[11px] text-fg-muted" />
      </div>
    </footer>
  );
}
