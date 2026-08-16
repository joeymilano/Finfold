import type { CoverContent } from "@/components/workbench/cover/cover-content";
import type { EditorialTheme } from "@/lib/cover/cover-themes";
import type { CoverSize, CoverSizeId, CoverTypeScale } from "@/lib/cover/cover-spec";

type PhotoImpactProps = {
  imageUrl: string;
  theme: EditorialTheme;
  size: CoverSize;
  sizeId: CoverSizeId;
  type: CoverTypeScale;
  content: CoverContent;
};

/**
 * Image models make the atmosphere; the browser renders every visible word.
 * This keeps Chinese copy exact while still producing a genuinely visual cover.
 */
export function PhotoImpact({ imageUrl, theme, size, sizeId, type, content }: PhotoImpactProps) {
  const tall = sizeId === "xhs-3x4";
  const titleLength = Array.from(content.title).length;
  const titleScale = titleLength > 34 ? 0.68 : titleLength > 24 ? 0.78 : titleLength > 16 ? 0.88 : 1;
  const titleSize = Math.round(type.titlePx * (tall ? 1.13 : 1) * titleScale);
  const titleLines = content.title.split(/\n+/).filter(Boolean);

  return (
    <div
      style={{
        width: size.cssWidth,
        height: size.cssHeight,
        position: "relative",
        overflow: "hidden",
        background: "#07090c",
        color: "#ffffff",
        fontFamily: "var(--font-geist-sans), 'Noto Sans SC', sans-serif"
      }}
    >
      {/* The source may be a data URL or arbitrary persisted media URL; Next Image
          cannot safely optimize every export source used by modern-screenshot. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        crossOrigin="anonymous"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          filter: "saturate(0.9) contrast(1.04) brightness(0.86)",
          transform: "scale(1.015)"
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: tall
            ? "linear-gradient(180deg, rgba(5,7,10,.18) 0%, rgba(5,7,10,.08) 32%, rgba(5,7,10,.72) 62%, rgba(5,7,10,.98) 100%)"
            : "linear-gradient(90deg, rgba(5,7,10,.94) 0%, rgba(5,7,10,.68) 54%, rgba(5,7,10,.16) 100%)"
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: `${size.cssHeight * 0.055}px ${size.cssWidth * 0.065}px ${size.cssHeight * 0.045}px`,
          boxSizing: "border-box"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 5,
              background: theme.accent,
              color: theme.dark ? "#15100a" : "#ffffff",
              padding: `${Math.max(4, type.metaPx * 0.45)}px ${Math.max(9, type.metaPx * 0.85)}px`,
              fontSize: type.metaPx,
              fontWeight: 750,
              letterSpacing: "0.05em"
            }}
          >
            {content.kicker}
          </span>
          <span
            style={{
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              fontSize: type.metaPx,
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,.72)",
              whiteSpace: "nowrap",
              flexShrink: 0
            }}
          >
            {content.meta}
          </span>
        </div>

        <div
          style={{
            marginTop: tall ? "auto" : size.cssHeight * 0.15,
            maxWidth: tall ? "94%" : "64%",
            paddingBottom: tall ? size.cssHeight * 0.035 : 0
          }}
        >
          <span
            style={{
              display: "block",
              width: size.cssWidth * 0.12,
              height: Math.max(4, size.cssHeight * 0.008),
              borderRadius: 999,
              background: theme.accent,
              marginBottom: size.cssHeight * 0.022
            }}
          />
          <h1
            style={{
              margin: 0,
              color: "#ffffff",
              fontSize: titleSize,
              lineHeight: 1.04,
              letterSpacing: "-0.035em",
              fontWeight: 900,
              whiteSpace: "pre-line",
              overflowWrap: "anywhere",
              textShadow: "0 4px 26px rgba(0,0,0,.5)"
            }}
          >
            {titleLines.map((line, index) => (
              <span
                key={`${line}-${index}`}
                style={{
                  display: "block",
                  color: titleLines.length > 1 && index === titleLines.length - 1 ? theme.accent : "#ffffff"
                }}
              >
                {line}
              </span>
            ))}
          </h1>
          <p
            style={{
              margin: `${size.cssHeight * 0.022}px 0 0`,
              maxWidth: tall ? "92%" : "88%",
              color: "rgba(255,255,255,.78)",
              fontSize: type.bodyPx,
              fontWeight: 500,
              lineHeight: 1.45
            }}
          >
            {content.highlight}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginTop: tall ? 0 : "auto",
            paddingTop: size.cssHeight * 0.025,
            borderTop: "1px solid rgba(255,255,255,.18)",
            color: "rgba(255,255,255,.5)",
            fontSize: type.metaPx
          }}
        >
          <span style={{ fontWeight: 650, letterSpacing: "0.06em" }}>FINFOLD · CONTENT STUDIO</span>
          <span style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>01</span>
        </div>
      </div>
    </div>
  );
}
