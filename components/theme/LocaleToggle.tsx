"use client";

import { Check, Languages } from "@/components/ui/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

/** Each option is written in its own language so native speakers of either
 * language can always spot theirs — the same convention Apple and Google
 * use in their language menus. */
const localeOptions: { locale: Locale; label: string }[] = [
  { locale: "en", label: "English" },
  { locale: "zh", label: "简体中文" }
];

type LocaleToggleProps = {
  /**
   * Public marketing pages use real language URLs so search engines can
   * discover both versions. Dashboard pages omit these props and keep the
   * in-place toggle.
   */
  href?: string;
  targetLocale?: Locale;
};

export function LocaleToggle({ href, targetLocale }: LocaleToggleProps = {}) {
  const pathname = usePathname();
  const [locale, setLocale] = useState<Locale>("zh");
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Public pages know the current language from props at render time; the
  // dashboard reads it from local state (corrected right after mount).
  const currentLocale: Locale = href && targetLocale ? (targetLocale === "en" ? "zh" : "en") : locale;
  const menuLabel = currentLocale === "en" ? "Language" : "语言";

  function selectLocale(next: Locale) {
    setOpen(false);
    if (next === currentLocale) return;
    setLocale(next);
    applyLocale(next);
    document.documentElement.lang = next === "en" ? "en" : "zh-CN";
    void persistLocaleToProfile(next);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menuLabel}
        title={menuLabel}
        className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-surface text-fg-muted transition-colors hover:border-brand/50 hover:text-fg"
      >
        <Languages className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={menuLabel}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 grid min-w-[11rem] gap-0.5 rounded-xl border border-hairline bg-surface p-1.5 shadow-raised"
        >
          {localeOptions.map((option) => {
            const isCurrent = option.locale === currentLocale;
            const itemClass = `focus-ring flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
              isCurrent ? "font-semibold text-fg" : "text-fg-muted transition-colors hover:bg-fg/5 hover:text-fg"
            }`;
            const check = isCurrent ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-brand" />
            ) : (
              <span className="inline-flex h-3.5 w-3.5 shrink-0" aria-hidden />
            );

            // On public pages the "other" language navigates to its real URL
            // (keeps hreflang links crawlable); the current one just closes.
            if (href && targetLocale && option.locale === targetLocale) {
              return (
                <Link
                  key={option.locale}
                  role="menuitem"
                  href={href}
                  hrefLang={targetLocale === "en" ? "en" : "zh-CN"}
                  lang={targetLocale === "en" ? "en" : "zh-CN"}
                  onClick={() => {
                    applyLocale(targetLocale);
                    void persistLocaleToProfile(targetLocale);
                    setOpen(false);
                  }}
                  className={itemClass}
                >
                  {option.label}
                  {check}
                </Link>
              );
            }

            return (
              <button
                key={option.locale}
                type="button"
                role="menuitem"
                onClick={() => selectLocale(option.locale)}
                className={itemClass}
              >
                {option.label}
                {check}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
