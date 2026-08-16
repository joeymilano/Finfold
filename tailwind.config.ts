import type { Config } from "tailwindcss";

const withAlpha = (token: string) => `rgb(var(${token}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      // Tailwind's default spacing scale jumps 4 → 5 with no 4.5 step.
      // Several social mockups render their bottom action icons (Heart /
      // Comment / Share / Save …) and content padding with h-4.5 / w-4.5 /
      // p-4.5 (≈18px). Without this entry those classes silently generate
      // NO css, so the SVG icons lose their size constraint and blow up to
      // fill the preview card — the recurring "huge preview icon" bug.
      spacing: {
        "4.5": "1.125rem"
      },
      colors: {
        bg: withAlpha("--bg"),
        surface: withAlpha("--surface"),
        "surface-2": withAlpha("--surface-2"),
        "surface-raised": withAlpha("--surface-raised"),
        hairline: withAlpha("--hairline"),
        "hairline-strong": withAlpha("--hairline-strong"),
        fg: withAlpha("--fg"),
        "fg-muted": withAlpha("--fg-muted"),
        brand: withAlpha("--brand"),
        "brand-strong": withAlpha("--brand-strong"),
        "on-brand": withAlpha("--on-brand"),
        action: withAlpha("--action"),
        "action-strong": withAlpha("--action-strong"),
        "action-soft": withAlpha("--action-soft"),
        "on-action": withAlpha("--on-action"),
        accent: withAlpha("--accent"),
        positive: withAlpha("--positive"),
        info: withAlpha("--info"),
        warn: withAlpha("--warn"),
        risk: withAlpha("--risk")
      },
      borderRadius: {
        panel: "var(--panel-radius)"
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        raised: "var(--shadow-raised)",
        "glow-brand": "0 0 0 1px rgb(var(--brand) / 0.35), 0 8px 30px -6px rgb(var(--brand) / 0.45)",
        "glow-action": "0 0 0 1px rgb(var(--action) / 0.28), 0 10px 32px -12px rgb(var(--action) / 0.38)"
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
