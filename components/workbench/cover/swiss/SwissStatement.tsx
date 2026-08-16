import type { SwissAccent } from "@/lib/cover/cover-themes";
import { swissDisplayWeight } from "@/lib/cover/cover-themes";
import type { CoverSize, CoverTypeScale } from "@/lib/cover/cover-spec";
import type { CoverContent } from "@/components/workbench/cover/cover-content";

type SwissStatementProps = {
  accent: SwissAccent;
  size: CoverSize;
  type: CoverTypeScale;
  content: CoverContent;
};

export function SwissStatement({ accent, size, type, content }: SwissStatementProps) {
  // Scale the title weight/size relative to what it'd render as at 1080px export
  // width, per the Swiss "the larger, the lighter" rule.
  const titleAt1080 = type.titlePx * (1080 / size.cssWidth);
  const titleWeight = swissDisplayWeight(titleAt1080);

  return (
    <div
      style={{
        width: size.cssWidth,
        height: size.cssHeight,
        position: "relative",
        overflow: "hidden",
        background: accent.paper,
        color: accent.ink,
        fontFamily: "var(--font-geist-sans), 'Inter', sans-serif"
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size.cssWidth * 0.16,
          height: 4,
          background: accent.accent
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: `${size.cssHeight * 0.09}px ${size.cssWidth * 0.08}px`,
          boxSizing: "border-box"
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontWeight: 600,
            fontSize: type.kickerPx,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: accent.accent
          }}
        >
          {content.kicker}
        </div>

        <h1
          style={{
            fontFamily: "var(--font-geist-sans), 'Inter', sans-serif",
            fontWeight: titleWeight,
            fontSize: type.titlePx,
            letterSpacing: "-0.015em",
            lineHeight: 1.12,
            margin: `${size.cssHeight * 0.035}px 0 0 0`,
            color: accent.ink,
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
            paddingTop: size.cssHeight * 0.03,
            borderTop: `1px solid ${accent.grey2}`
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-geist-sans), 'Inter', sans-serif",
              fontWeight: 500,
              fontSize: type.bodyPx,
              color: accent.grey3,
              maxWidth: "70%"
            }}
          >
            {content.highlight}
          </span>
          <span
            style={{
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              fontWeight: 600,
              fontSize: type.metaPx,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: accent.grey3
            }}
          >
            {content.meta}
          </span>
        </div>
      </div>
    </div>
  );
}
