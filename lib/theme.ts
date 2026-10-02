import { localeFromLanguageTag, type Locale } from "@/lib/i18n";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "finfold-theme";
export const DEFAULT_THEME: Theme = "dark";

// ── Locale (global, localStorage-backed) ────────────────────
// Locale itself is defined in lib/i18n.ts (the dictionary's home); this
// module only re-exports it so existing `from "@/lib/theme"` imports keep
// working without every call site needing to change its import path.
export type { Locale };
export const LOCALE_STORAGE_KEY = "finfold-locale";
export const DEFAULT_LOCALE: Locale = "zh";

/** Return only a locale the visitor deliberately saved in this browser. */
export function getExplicitLocalePreference(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (v === "zh" || v === "en") return v;
  } catch { /* storage unavailable */ }
  const cookieLocale = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${LOCALE_STORAGE_KEY}=`))
    ?.split("=")[1];
  if (cookieLocale === "zh" || cookieLocale === "en") return cookieLocale;
  return null;
}

export function getStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const explicitLocale = getExplicitLocalePreference();
  if (explicitLocale) return explicitLocale;
  const lang = document.documentElement.lang;
  if (lang === "zh" || lang === "zh-CN") return "zh";
  if (lang === "en") return "en";
  const browserLanguage = navigator.languages?.[0] ?? navigator.language;
  return browserLanguage ? localeFromLanguageTag(browserLanguage) : DEFAULT_LOCALE;
}

export function applyLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch { /* storage unavailable */ }
  document.cookie = `${LOCALE_STORAGE_KEY}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
  window.dispatchEvent(new CustomEvent("finfold-locale-change", { detail: locale }));
}

/**
 * Inline script injected in <head> before hydration so the saved theme is
 * applied to <html data-theme> synchronously — prevents a light→dark flash.
 * The landing page ("/" and "/en") is dark-only by design, so the stored
 * preference is ignored there; LandingPage also enforces this after
 * hydration and restores the saved theme on the way back into the app.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=window.location.pathname;var landing=p==='/'||p==='/en'||p==='/en/';var t=landing?'dark':localStorage.getItem('${THEME_STORAGE_KEY}');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") {
    return attr;
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: Theme): void {
  if (typeof window === "undefined") {
    return;
  }
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — non-fatal */
  }
}
