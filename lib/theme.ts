export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "finfold-theme";
export const DEFAULT_THEME: Theme = "dark";

// ── Locale (global, localStorage-backed) ────────────────────
export type Locale = "zh" | "en";
export const LOCALE_STORAGE_KEY = "finfold-locale";
export const DEFAULT_LOCALE: Locale = "en";

export function getStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (v === "zh" || v === "en") return v;
  } catch { /* storage unavailable */ }
  const cookieLocale = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${LOCALE_STORAGE_KEY}=`))
    ?.split("=")[1];
  if (cookieLocale === "zh" || cookieLocale === "en") return cookieLocale;
  const lang = document.documentElement.lang;
  if (lang === "zh" || lang === "zh-CN") return "zh";
  if (lang === "en") return "en";
  return DEFAULT_LOCALE;
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
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

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
