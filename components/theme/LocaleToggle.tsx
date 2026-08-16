"use client";

import { Languages } from "@/components/ui/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { applyLocale, getStoredLocale, type Locale } from "@/lib/theme";

async function persistLocaleToProfile(locale: Locale) {
  try {
    await fetch("/api/settings/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale })
    });
  } catch {
    // Non-critical — localStorage is already updated
  }
}

type LocaleToggleProps = {
  /**
   * Public marketing pages use real language URLs so search engines can
   * discover both versions. Dashboard pages omit these props and keep the
   * local in-place toggle.
   */
  href?: string;
  targetLocale?: Locale;
};

export function LocaleToggle({ href, targetLocale }: LocaleToggleProps = {}) {
  const pathname = usePathname();
  const [locale, setLocale] = useState<Locale>("zh");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocale(getStoredLocale());
    setMounted(true);

    function onLocaleChange(e: Event) {
      setLocale((e as CustomEvent<Locale>).detail);
    }
    window.addEventListener("finfold-locale-change", onLocaleChange);
    return () => window.removeEventListener("finfold-locale-change", onLocaleChange);
  }, []);

  useEffect(() => {
    if (mounted) {
      setLocale(getStoredLocale());
    }
  }, [mounted, pathname]);

  function toggle() {
    const current = getStoredLocale();
    const next: Locale = current === "zh" ? "en" : "zh";
    setLocale(next);
    applyLocale(next);
    document.documentElement.lang = next === "en" ? "en" : "zh-CN";
    void persistLocaleToProfile(next);
  }

  if (href && targetLocale) {
    const label = targetLocale === "en" ? "EN" : "中文";
    const accessibleLabel = targetLocale === "en" ? "Switch to English" : "切换为中文";

    return (
      <Link
        href={href}
        hrefLang={targetLocale === "en" ? "en" : "zh-CN"}
        lang={targetLocale === "en" ? "en" : "zh-CN"}
        onClick={() => {
          applyLocale(targetLocale);
          void persistLocaleToProfile(targetLocale);
        }}
        aria-label={accessibleLabel}
        title={accessibleLabel}
        className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 text-xs font-semibold text-fg-muted transition-colors hover:border-brand/50 hover:text-fg"
      >
        <Languages className="h-3.5 w-3.5 shrink-0" />
        <span className="leading-none">{label}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={locale === "zh" ? "Switch to English" : "切换为中文"}
      title={locale === "zh" ? "Switch to English" : "切换为中文"}
      className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 text-xs font-semibold text-fg-muted transition-colors hover:border-brand/50 hover:text-fg"
    >
      <Languages className="h-3.5 w-3.5 shrink-0" />
      <span className="leading-none">{mounted ? (locale === "zh" ? "EN" : "中文") : "EN"}</span>
    </button>
  );
}
