"use client";

import { Languages } from "lucide-react";
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

export function LocaleToggle() {
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

  function toggle() {
    const next: Locale = locale === "zh" ? "en" : "zh";
    setLocale(next);
    applyLocale(next);
    document.documentElement.lang = next === "en" ? "en" : "zh-CN";
    void persistLocaleToProfile(next);
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
