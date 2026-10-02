"use client";

import { Lightbulb, Moon } from "@/components/ui/icons";
import React, { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";
import { useLocale } from "@/hooks/useLocale";

/** Labels reflect the current "Studio Floor" theme naming (see
 * docs/design-redesign-2026.md) — dark is the cinematic default, light is
 * the paper-toned alternate. Locale-aware, unlike the stale zh-only strings
 * this replaced. */
const LABELS = {
  zh: { toDark: "切换到暗色主题", toLight: "切换到亮色主题", dark: "暗色", light: "亮色" },
  en: { toDark: "Switch to dark theme", toLight: "Switch to light theme", dark: "Dark", light: "Light" }
} as const;

export function ThemeToggle() {
  const locale = useLocale();
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getStoredTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  const isDark = theme === "dark";
  const copy = LABELS[locale];

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? copy.toLight : copy.toDark}
      title={isDark ? copy.light : copy.dark}
      className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-surface text-fg-muted transition-colors hover:border-brand/50 hover:text-fg"
    >
      {/* render a stable icon until mounted to avoid hydration mismatch */}
      {mounted && isDark ? <Lightbulb className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
