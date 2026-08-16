import type { EditorialTheme } from "@/lib/cover/cover-themes";
import type { CoverSize, CoverTypeScale } from "@/lib/cover/cover-spec";
import type { CoverContent } from "@/components/workbench/cover/cover-content";

type EditorialHeroProps = {
  theme: EditorialTheme;
  size: CoverSize;
  type: CoverTypeScale;
  content: CoverContent;
};

// Inline SVG grain — capture-safe (no external asset, no CORS taint) atmosphere
// layer per the Editorial "flat paper is not enough" rule.
const GRAIN_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

export function EditorialHero({ theme, size, type, content }: EditorialHeroProps) {
  return (
    <div
      style={{
        width: size.cssWidth,
        height: size.cssHeight,
        position: "relative",
        overflow: "hidden",
        background: theme.paper,
        color: theme.ink,
        fontFamily: "var(--font-geist-sans), sans-serif"
      }}
    >
      {/* Atmosphere layer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: theme.dark ? 0.22 : 0.1,
          mixBlendMode: theme.dark ? "screen" : "multiply",
          backgroundImage: `url("${GRAIN_DATA_URL}")`,
          pointerEvents: "none"
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: theme.dark
            ? `radial-gradient(80% 50% at 28% 16%, ${theme.accent}22, transparent 64%), linear-gradient(180deg, ${theme.ink}05, #00000052)`
            : `radial-gradient(70% 55% at 78% 12%, ${theme.accentSoft}55, transparent 68%)`,
          pointerEvents: "none"
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: `${size.cssHeight * 0.08}px ${size.cssWidth * 0.09}px`,
          boxSizing: "border-box"
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontWeight: 500,
            fontSize: type.kickerPx,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: theme.accent
          }}
        >
          {content.kicker}
        </div>

        <h1
          style={{
            fontFamily: "var(--font-cover-serif), 'Songti SC', 'STSong', serif",
            fontWeight: 500,
            fontSize: type.titlePx,
            letterSpacing: "0.03em",
            lineHeight: 1.28,
            margin: `${size.cssHeight * 0.03}px 0 0 0`,
            color: theme.ink,
            flexGrow: 1
          }}
        >
          {content.title}
        </h1>

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginTop: "auto",
            paddingTop: size.cssHeight * 0.035,
            borderTop: `1px solid ${theme.line}`
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-geist-sans), sans-serif",
              fontSize: type.bodyPx,
              color: theme.muted,
              maxWidth: "70%"
            }}
          >
            {content.highlight}
          </span>
          <span
            style={{
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              fontSize: type.metaPx,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: theme.muted
            }}
          >
            {content.meta}
          </span>
        </div>
      </div>
    </div>
  );
}
