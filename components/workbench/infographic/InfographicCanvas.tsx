import React from "react";
import type { CoverSize, CoverSizeId } from "@/lib/cover/cover-spec";
import { getEditorialTheme, getSwissAccent, type EditorialTheme, type SwissAccent } from "@/lib/cover/cover-themes";
import { swissDisplayWeight } from "@/lib/cover/cover-themes";
import type { InfographicItem, InfographicSpec } from "@/lib/infographic/spec";

type Palette = {
  paper: string;
  paper2: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accentSoft: string;
  accentOn: string;
  serifTitle: boolean;
  dotGrid: boolean;
};

function editorialPalette(theme: EditorialTheme): Palette {
  return {
    paper: theme.paper,
    paper2: theme.paper2,
    ink: theme.ink,
    muted: theme.muted,
    line: theme.line,
    accent: theme.accent,
    accentSoft: theme.accentSoft,
    accentOn: "#ffffff",
    serifTitle: true,
    dotGrid: false
  };
}

function swissPalette(accent: SwissAccent): Palette {
  return {
    paper: accent.paper,
    paper2: accent.grey1,
    ink: accent.ink,
    muted: accent.grey3,
    line: accent.grey2,
    accent: accent.accent,
    accentSoft: accent.grey1,
    accentOn: accent.accentOn,
    serifTitle: false,
    dotGrid: true
  };
}

const sansFont = "var(--font-geist-sans), 'Noto Sans SC', sans-serif";
const serifFont = "Georgia, 'Times New Roman', 'Songti SC', 'SimSun', serif";
const monoFont = "var(--font-geist-mono), ui-monospace, monospace";

type InfographicCanvasProps = {
  spec: InfographicSpec;
  size: CoverSize;
  sizeId: CoverSizeId;
};

/**
 * Deterministic infographic renderer. Six layouts over the shared cover
 * theme assets — every visible character is browser-rendered text.
 */
export function InfographicCanvas({ spec, size, sizeId }: InfographicCanvasProps) {
  const palette = spec.style === "swiss" ? swissPalette(getSwissAccent(spec.themeId)) : editorialPalette(getEditorialTheme(spec.themeId));
  const tall = size.cssHeight > size.cssWidth;
  const pad = Math.round(size.cssWidth * 0.075);
  const titleFont = palette.serifTitle ? serifFont : sansFont;

  const header = (
    <header style={{ flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontFamily: monoFont, fontSize: 11, letterSpacing: "0.22em", color: palette.muted, fontWeight: 650 }}>FINFOLD · INFOGRAPHIC</span>
        <span style={{ fontFamily: monoFont, fontSize: 11, letterSpacing: "0.18em", color: palette.accent, fontWeight: 700 }}>{layoutBadge(spec.layout)}</span>
      </div>
      <h1
        style={{
          margin: `${Math.round(size.cssHeight * 0.028)}px 0 0`,
          fontFamily: titleFont,
          fontSize: titleSize(size, spec.title, tall),
          fontWeight: palette.serifTitle ? 700 : swissDisplayWeight(64),
          lineHeight: 1.16,
          letterSpacing: palette.serifTitle ? "-0.01em" : "-0.03em",
          color: palette.ink,
          overflowWrap: "anywhere"
        }}
      >
        {spec.title}
      </h1>
      {spec.subtitle ? (
        <p style={{ margin: `${Math.round(size.cssHeight * 0.016)}px 0 0`, fontSize: 15, lineHeight: 1.6, color: palette.muted, fontWeight: 500 }}>{spec.subtitle}</p>
      ) : null}
      <div style={{ marginTop: Math.round(size.cssHeight * 0.026), height: 2, background: palette.accent }} />
    </header>
  );

  const footer = (
    <footer style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderTop: `1px solid ${palette.line}`, paddingTop: Math.round(size.cssHeight * 0.02) }}>
      <span style={{ fontSize: 11, letterSpacing: "0.14em", fontWeight: 650, color: palette.muted }}>{spec.footer || "Finfold · Content Studio"}</span>
      <span style={{ fontFamily: monoFont, fontSize: 11, color: palette.muted }}>{sizeId === "square-1x1" ? "1:1" : "3:4"}</span>
    </footer>
  );

  return (
    <div
      style={{
        width: size.cssWidth,
        height: size.cssHeight,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        padding: `${Math.round(size.cssHeight * 0.05)}px ${pad}px ${Math.round(size.cssHeight * 0.045)}px`,
        background: palette.paper,
        backgroundImage: palette.dotGrid
          ? `radial-gradient(${palette.line} 1px, transparent 1px)`
          : `radial-gradient(circle at 85% 8%, ${palette.paper2} 0%, transparent 52%)`,
        backgroundSize: palette.dotGrid ? "22px 22px" : undefined,
        color: palette.ink,
        fontFamily: sansFont,
        overflow: "hidden"
      }}
    >
      {header}
      <main style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: Math.round(size.cssHeight * 0.03), paddingBottom: Math.round(size.cssHeight * 0.024) }}>
        {renderBody(spec, palette, size, tall)}
      </main>
      {footer}
    </div>
  );
}

function renderBody(spec: InfographicSpec, palette: Palette, size: CoverSize, tall: boolean): React.ReactNode {
  switch (spec.layout) {
    case "stats-grid":
      return <StatsGrid items={spec.items} palette={palette} size={size} />;
    case "timeline":
      return <Timeline items={spec.items} palette={palette} size={size} />;
    case "process":
      return <Process items={spec.items} palette={palette} size={size} tall={tall} />;
    case "comparison":
      return <Comparison items={spec.items} palette={palette} size={size} />;
    case "checklist":
      return <Checklist items={spec.items} palette={palette} size={size} />;
    case "quote-board":
      return <QuoteBoard items={spec.items} palette={palette} size={size} />;
    default:
      return null;
  }
}

function StatsGrid({ items, palette, size }: { items: InfographicItem[]; palette: Palette; size: CoverSize }) {
  const columns = items.length <= 2 || items.length === 4 ? 2 : 3;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: Math.round(size.cssWidth * 0.035) }}>
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            minHeight: Math.round(size.cssHeight * 0.16),
            padding: Math.round(size.cssWidth * 0.04),
            borderRadius: palette.dotGrid ? 0 : 16,
            background: palette.paper2,
            border: `1px solid ${palette.line}`,
            boxSizing: "border-box",
            overflow: "hidden"
          }}
        >
          {item.value ? (
            <span style={{ fontFamily: monoFont, fontSize: Math.round(size.cssWidth * 0.11), fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.04em", color: palette.accent }}>{item.value}</span>
          ) : null}
          <span style={{ marginTop: item.value ? Math.round(size.cssWidth * 0.016) : 0, fontSize: Math.round(size.cssWidth * 0.032), fontWeight: 700, lineHeight: 1.4, color: palette.ink }}>{item.label}</span>
          {item.note ? <span style={{ marginTop: 4, fontSize: Math.round(size.cssWidth * 0.024), lineHeight: 1.5, color: palette.muted }}>{item.note}</span> : null}
        </div>
      ))}
    </div>
  );
}

function Timeline({ items, palette, size }: { items: InfographicItem[]; palette: Palette; size: CoverSize }) {
  const gap = Math.round(size.cssHeight * 0.024);
  return (
    <div style={{ position: "relative", paddingLeft: Math.round(size.cssWidth * 0.062) }}>
      <span style={{ position: "absolute", left: Math.round(size.cssWidth * 0.024), top: 8, bottom: 8, width: 2, background: palette.line }} />
      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: Math.round(-size.cssWidth * 0.062 + size.cssWidth * 0.024 - 5), top: 6, width: 12, height: 12, borderRadius: 999, background: palette.accent, boxShadow: `0 0 0 4px ${palette.paper}` }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              {item.value ? <span style={{ fontFamily: monoFont, fontSize: Math.round(size.cssWidth * 0.045), fontWeight: 800, color: palette.accent, whiteSpace: "nowrap" }}>{item.value}</span> : null}
              <span style={{ fontSize: Math.round(size.cssWidth * 0.033), fontWeight: 750, lineHeight: 1.45, color: palette.ink }}>{item.label}</span>
            </div>
            {item.note ? <p style={{ margin: "3px 0 0", fontSize: Math.round(size.cssWidth * 0.026), lineHeight: 1.55, color: palette.muted }}>{item.note}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Process({ items, palette, size, tall }: { items: InfographicItem[]; palette: Palette; size: CoverSize; tall: boolean }) {
  if (!tall && items.length <= 3) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: Math.round(size.cssWidth * 0.03) }}>
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} style={{ display: "flex", flexDirection: "column", gap: Math.round(size.cssHeight * 0.016) }}>
            <span style={{ fontFamily: monoFont, fontSize: Math.round(size.cssWidth * 0.085), fontWeight: 800, lineHeight: 1, color: palette.accent }}>{String(index + 1).padStart(2, "0")}</span>
            <span style={{ height: 2, background: palette.line }} />
            <span style={{ fontSize: Math.round(size.cssWidth * 0.03), fontWeight: 700, lineHeight: 1.45, color: palette.ink }}>{item.label}</span>
            {item.note ? <span style={{ fontSize: Math.round(size.cssWidth * 0.024), lineHeight: 1.5, color: palette.muted }}>{item.note}</span> : null}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: Math.round(size.cssHeight * 0.02) }}>
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} style={{ display: "flex", alignItems: "flex-start", gap: Math.round(size.cssWidth * 0.03) }}>
          <span style={{ flexShrink: 0, width: Math.round(size.cssWidth * 0.093), height: Math.round(size.cssWidth * 0.093), borderRadius: palette.dotGrid ? 0 : 999, background: palette.accent, color: palette.accentOn, fontFamily: monoFont, fontSize: Math.round(size.cssWidth * 0.036), fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{index + 1}</span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: Math.round(size.cssWidth * 0.033), fontWeight: 750, lineHeight: 1.4, color: palette.ink }}>{item.label}</p>
            {item.note ? <p style={{ margin: "3px 0 0", fontSize: Math.round(size.cssWidth * 0.026), lineHeight: 1.5, color: palette.muted }}>{item.note}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function Comparison({ items, palette, size }: { items: InfographicItem[]; palette: Palette; size: CoverSize }) {
  const [left, right] = items;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: Math.round(size.cssWidth * 0.03) }}>
      <section style={{ padding: Math.round(size.cssWidth * 0.04), borderRadius: palette.dotGrid ? 0 : 16, background: palette.paper2, border: `1px solid ${palette.line}`, overflow: "hidden" }}>
        <p style={{ margin: 0, fontSize: Math.round(size.cssWidth * 0.038), fontWeight: 800, color: palette.ink }}>{left?.value ?? "A"}</p>
        <p style={{ margin: "4px 0 0", fontSize: Math.round(size.cssWidth * 0.026), lineHeight: 1.55, color: palette.muted }}>{left?.label}</p>
      </section>
      <section style={{ padding: Math.round(size.cssWidth * 0.04), borderRadius: palette.dotGrid ? 0 : 16, background: palette.accent, color: palette.accentOn, overflow: "hidden" }}>
        <p style={{ margin: 0, fontSize: Math.round(size.cssWidth * 0.038), fontWeight: 800 }}>{right?.value ?? "B"}</p>
        <p style={{ margin: "4px 0 0", fontSize: Math.round(size.cssWidth * 0.026), lineHeight: 1.55, opacity: 0.85 }}>{right?.label}</p>
      </section>
      {items.length > 2 ? (
        <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6 }}>
          {items.slice(2).map((item, index) => (
            <div key={`${item.label}-${index}`} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ flexShrink: 0, fontFamily: monoFont, fontSize: Math.round(size.cssWidth * 0.028), fontWeight: 750, color: palette.accent }}>{item.value ?? "•"}</span>
              <span style={{ fontSize: Math.round(size.cssWidth * 0.026), lineHeight: 1.55, color: palette.ink }}>{item.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Checklist({ items, palette, size }: { items: InfographicItem[]; palette: Palette; size: CoverSize }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: Math.round(size.cssHeight * 0.016) }}>
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} style={{ display: "flex", alignItems: "flex-start", gap: Math.round(size.cssWidth * 0.028), padding: `${Math.round(size.cssWidth * 0.03)}px ${Math.round(size.cssWidth * 0.035)}px`, borderRadius: palette.dotGrid ? 0 : 14, background: palette.paper2, border: `1px solid ${palette.line}` }}>
          <span style={{ flexShrink: 0, width: Math.round(size.cssWidth * 0.05), height: Math.round(size.cssWidth * 0.05), borderRadius: palette.dotGrid ? 0 : 999, background: palette.accent, color: palette.accentOn, fontSize: Math.round(size.cssWidth * 0.026), fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: Math.round(size.cssWidth * 0.031), fontWeight: 700, lineHeight: 1.45, color: palette.ink }}>{item.label}</p>
            {item.note ? <p style={{ margin: "2px 0 0", fontSize: Math.round(size.cssWidth * 0.024), lineHeight: 1.5, color: palette.muted }}>{item.note}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function QuoteBoard({ items, palette, size }: { items: InfographicItem[]; palette: Palette; size: CoverSize }) {
  const quote = items[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: Math.round(size.cssHeight * 0.03) }}>
      <span style={{ fontFamily: serifFont, fontSize: Math.round(size.cssWidth * 0.19), lineHeight: 0.8, color: palette.accent }}>&ldquo;</span>
      <p style={{ margin: 0, fontFamily: palette.serifTitle ? serifFont : sansFont, fontSize: Math.round(size.cssWidth * 0.062), fontWeight: palette.serifTitle ? 700 : 800, lineHeight: 1.42, letterSpacing: "-0.01em", color: palette.ink }}>{quote?.label}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: Math.round(size.cssWidth * 0.08), height: 2, background: palette.accent }} />
        <span style={{ fontFamily: monoFont, fontSize: Math.round(size.cssWidth * 0.026), letterSpacing: "0.1em", color: palette.muted }}>{quote?.value ?? quote?.note ?? "FINFOLD"}</span>
      </div>
    </div>
  );
}

function layoutBadge(layout: InfographicSpec["layout"]): string {
  const badges: Record<InfographicSpec["layout"], string> = {
    "stats-grid": "STATS",
    timeline: "TIMELINE",
    process: "PROCESS",
    comparison: "VS",
    checklist: "CHECKLIST",
    "quote-board": "QUOTE"
  };
  return badges[layout];
}

function titleSize(size: CoverSize, title: string, tall: boolean): number {
  const length = Array.from(title).length;
  const base = tall ? Math.round(size.cssWidth * 0.082) : Math.round(size.cssWidth * 0.072);
  if (length > 26) return Math.round(base * 0.72);
  if (length > 16) return Math.round(base * 0.85);
  return base;
}
