"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
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

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "切换到亮色主题" : "切换到暗色演示主题"}
      title={isDark ? "Editorial 亮色" : "Signal 暗色演示"}
      className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border border-hairline bg-surface text-fg-muted transition-colors hover:border-brand/50 hover:text-fg"
    >
      {/* render a stable icon until mounted to avoid hydration mismatch */}
      {mounted && isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
