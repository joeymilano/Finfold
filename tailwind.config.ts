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
      colors: {
        bg: withAlpha("--bg"),
        surface: withAlpha("--surface"),
        "surface-2": withAlpha("--surface-2"),
        hairline: withAlpha("--hairline"),
        fg: withAlpha("--fg"),
        "fg-muted": withAlpha("--fg-muted"),
        brand: withAlpha("--brand"),
        "brand-strong": withAlpha("--brand-strong"),
        accent: withAlpha("--accent"),
        positive: withAlpha("--positive"),
        warn: withAlpha("--warn"),
        risk: withAlpha("--risk"),

        // transitional aliases — keep legacy workbench code compiling
        // until each component is migrated to semantic tokens.
        ink: "#111315",
        graphite: "#2d3238",
        mist: "#f3f1e8",
        line: "#111315",
        lime: "#bcff3d",
        indigo: "#4936f5",
        paper: "#fffdf5",
        coral: "#ff5a3d",
        cyan: "#3de7ff"
      },
      borderRadius: {
        panel: "var(--panel-radius)"
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        raised: "var(--shadow-raised)",
        "glow-brand": "0 0 0 1px rgb(var(--brand) / 0.35), 0 8px 30px -6px rgb(var(--brand) / 0.45)",
        // legacy brutalist shadows (workbench, pre-migration)
        hard: "8px 8px 0 #111315",
        lime: "6px 6px 0 #bcff3d"
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
