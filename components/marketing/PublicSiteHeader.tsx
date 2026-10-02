"use client";

import Link from "next/link";
import { Menu, X } from "@/components/ui/icons";
import React from "react";
import { useEffect, useRef, useState } from "react";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { LocaleToggle } from "@/components/theme/LocaleToggle";
import { LandingUserAvatar, usePublicAuthUser } from "@/components/marketing/LandingUserAvatar";
import { TrackedCtaLink } from "@/components/marketing/TrackedCtaLink";
import { brand } from "@/lib/brand";
import type { Locale } from "@/lib/i18n";

export function PublicSiteHeader({
  locale,
  localeHref,
  sticky = false,
  scrolled = false
}: {
  locale: Locale;
  localeHref?: string;
  sticky?: boolean;
  scrolled?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null);
  // Signed-in visitors go straight to the product from the primary CTA;
  // guests keep the signup path.
  const { user } = usePublicAuthUser();
  const ctaHref = user ? "/dashboard" : "/signup?next=%2Fdashboard";
  const ctaLabel = user
    ? (locale === "en" ? "Open dashboard" : "进入工作台")
    : (locale === "en" ? "Find an opportunity" : "发现增长机会");
  const prefix = locale === "en" ? "/en" : "";
  const homeHref = prefix || "/";
  const links = [
    { href: `${homeHref}#product`, zh: "产品", en: "Product" },
    { href: `${prefix}/guide`, zh: "使用手册", en: "Guide" },
    { href: `${prefix}/use-cases`, zh: "使用场景", en: "Use cases" },
    { href: `${prefix}/tools`, zh: "免费工具", en: "Free tools" },
    { href: `${prefix}/blog`, zh: "增长博客", en: "Growth blog" },
    {
      href: locale === "en" ? "/extension/download?ui_locale=en" : "/extension/download",
      zh: "插件下载",
      en: "Extension"
    },
    { href: `${homeHref}#pricing`, zh: "价格", en: "Pricing" }
  ];

  useEffect(() => {
    if (!menuOpen) return;
    firstMobileLinkRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  return (
    <header
      ref={headerRef}
      className={`${sticky ? "sticky top-0 z-50" : "relative z-40"} transition-all duration-300 ${
        sticky && scrolled
          ? "border-b border-hairline bg-bg/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3.5">
        <Link href={homeHref} className="focus-ring flex shrink-0 items-center gap-2.5 rounded-lg">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg">
            <FishLogo variant="app-icon" className="h-9 w-9 object-cover" />
          </span>
          <span className="leading-none">
            <span className="block text-base font-semibold tracking-tight text-fg">{brand.name}</span>
            {locale === "zh" ? (
              <span className="brand-cn mt-0.5 block text-[10px] text-fg-muted">{brand.chineseName}</span>
            ) : null}
          </span>
        </Link>

        <nav
          aria-label={locale === "en" ? "Marketing navigation" : "官网导航"}
          className="liquid-glass hidden items-center gap-0 rounded-full px-1.5 py-1.5 text-[13px] text-fg-muted lg:flex lg:flex-1 lg:justify-center"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="focus-ring rounded-full px-2 py-1.5 transition-colors hover:bg-fg/5 hover:text-fg"
            >
              {locale === "en" ? link.en : link.zh}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <LocaleToggle
            href={localeHref}
            targetLocale={localeHref ? (locale === "en" ? "zh" : "en") : undefined}
          />
          <span className="hidden min-[430px]:block">
            <TrackedCtaLink
              href={ctaHref}
              sourceType="site_header"
              sourceSurface="header"
              ctaId="site_header_primary"
              destination={user ? "dashboard" : "signup"}
              audienceState={user ? "authenticated" : "anonymous"}
              locale={locale}
              className="btn-primary focus-ring px-3.5 py-1.5 text-sm"
            >
              {ctaLabel}
            </TrackedCtaLink>
          </span>
          <LandingUserAvatar locale={locale} />
          <button
            type="button"
            aria-label={locale === "en" ? "Toggle navigation" : "打开或关闭导航"}
            aria-expanded={menuOpen}
            aria-controls="public-mobile-navigation"
            className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg border border-hairline bg-surface/70 text-fg lg:hidden"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen ? (
          <nav
            id="public-mobile-navigation"
            aria-label={locale === "en" ? "Mobile marketing navigation" : "移动端官网导航"}
            className="liquid-glass-strong !absolute inset-x-5 top-[calc(100%+0.5rem)] z-50 grid gap-1 rounded-2xl p-2 shadow-raised lg:hidden"
          >
            {links.map((link, index) => (
              <Link
                key={link.href}
                ref={index === 0 ? firstMobileLinkRef : undefined}
                href={link.href}
                className="focus-ring rounded-xl px-4 py-3 text-sm font-semibold text-fg transition-colors hover:bg-fg/5"
                onClick={() => setMenuOpen(false)}
              >
                {locale === "en" ? link.en : link.zh}
              </Link>
            ))}
            <span className="min-[430px]:hidden">
              <TrackedCtaLink
                href={ctaHref}
                sourceType="site_header"
                sourceSurface="mobile_menu"
                ctaId="site_header_mobile_primary"
                destination={user ? "dashboard" : "signup"}
                audienceState={user ? "authenticated" : "anonymous"}
                locale={locale}
                className="btn-primary focus-ring mt-1 w-full"
                onClick={() => setMenuOpen(false)}
              >
                {ctaLabel}
              </TrackedCtaLink>
            </span>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
