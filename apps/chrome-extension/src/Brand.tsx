import { useEffect, useState } from "react";
import lightLogo from "./assets/app-icon-light.webp?inline";
import darkLogo from "./assets/app-icon-dark.webp?inline";
import { isChinese, uiLocale, setUiLocale, useUiLocale } from "./i18n";

// Vite embeds the canonical App assets; no root URL or generated dev-only path.
export function Brand() {
  useUiLocale();
  return <div className="brand-lockup">
    <span className="brand-symbol">
      <img className="logo-light" src={lightLogo} alt="" width="40" height="40" />
      <img className="logo-dark" src={darkLogo} alt="" width="40" height="40" />
    </span>
    <div><span className="brand">Finfold</span><span className="product-line">{isChinese ? "你的 AI 增长助手" : "Your AI growth assistant"}</span></div>
  </div>;
}

export function ThemeButton() {
  useUiLocale();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () => setDark(document.documentElement.dataset.theme === "dark");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const title = isChinese ? (dark ? "切换浅色" : "切换深色") : (dark ? "Use light theme" : "Use dark theme");
  return <button className="theme-button" type="button" title={title} aria-label={title} onClick={() => {
    const theme = dark ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    void chrome.storage.local.set({ finfoldTheme: theme }).catch(() => undefined);
  }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    {dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.4 14.1A8.6 8.6 0 0 1 9.9 3.6a8.6 8.6 0 1 0 10.5 10.5Z" />}
  </svg></button>;
}

export function ModeTabs({ mode, disabled, onChange }: { mode: "post" | "reply"; disabled?: boolean; onChange?: (mode: "post" | "reply") => void }) {
  useUiLocale();
  return <nav className="mode-switch" aria-label={isChinese ? "创作模式" : "Creation mode"}>
    <button disabled={disabled} aria-pressed={mode === "post"} onClick={() => onChange?.("post")}><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M11 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M8 12l1-4 6-6 3 3-6 6-4 1Z" /></svg>{isChinese ? "生成帖子" : "Create post"}</button>
    <button disabled={disabled} aria-pressed={mode === "reply"} onClick={() => onChange?.("reply")}><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 3h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H8l-5 3V4a1 1 0 0 1 1-1Z" /><path d="M6 7h8M6 10h5" /></svg>{isChinese ? "回复评论" : "Reply to comment"}<span>{isChinese ? "公测" : "Beta"}</span></button>
  </nav>;
}

export function LanguageButton() {
  useUiLocale();
  const [error, setError] = useState("");
  return <><button className="language-button" type="button" aria-label={isChinese ? "Switch interface to English" : "将界面切换为中文"} title={isChinese ? "Switch to English" : "切换为中文"} onClick={() => {
    setError("");
    void setUiLocale(uiLocale === "zh" ? "en" : "zh").catch(() => setError(isChinese ? "语言设置未能保存，请重试。" : "Language preference could not be saved. Try again."));
  }}>{isChinese ? "EN" : "中文"}</button>{error && <span className="language-error" role="alert">{error}</span>}</>;
}
