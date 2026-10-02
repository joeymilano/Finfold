import type { CoverContent } from "@/components/workbench/cover/cover-content";
import type { EditorialTheme } from "@/lib/cover/cover-themes";
import type { CoverSize, CoverSizeId, CoverTypeScale, PhotoComposition } from "@/lib/cover/cover-spec";

type PhotoImpactProps = {
  imageUrl: string;
  theme: EditorialTheme;
  size: CoverSize;
  sizeId: CoverSizeId;
  type: CoverTypeScale;
  content: CoverContent;
  focalPoint?: { x: number; y: number };
  composition?: PhotoComposition;
};

/**
 * Image models make the atmosphere; the browser renders every visible word.
 * This keeps Chinese copy exact while still producing a genuinely visual cover.
 * Composition variants change how photo and copy share the canvas — the
 * title always keeps its own safe zone instead of overlapping the subject.
 */
export function PhotoImpact({ imageUrl, theme, size, sizeId, type, content, focalPoint, composition = "cinematic" }: PhotoImpactProps) {
  if (composition === "split") {
    return <SplitComposition imageUrl={imageUrl} theme={theme} size={size} sizeId={sizeId} type={type} content={content} focalPoint={focalPoint} />;
  }
  if (composition === "portrait-window") {
    return <PortraitWindowComposition imageUrl={imageUrl} theme={theme} size={size} sizeId={sizeId} type={type} content={content} focalPoint={focalPoint} />;
  }
  if (composition === "bottom-band") {
    return <BottomBandComposition imageUrl={imageUrl} theme={theme} size={size} sizeId={sizeId} type={type} content={content} focalPoint={focalPoint} />;
  }
  return <CinematicComposition imageUrl={imageUrl} theme={theme} size={size} sizeId={sizeId} type={type} content={content} focalPoint={focalPoint} />;
}

type CompositionProps = {
  imageUrl: string;
  theme: EditorialTheme;
  size: CoverSize;
  sizeId: CoverSizeId;
  type: CoverTypeScale;
  content: CoverContent;
  focalPoint?: { x: number; y: number };
};

const displayFont = "var(--font-geist-sans), 'Noto Sans SC', sans-serif";
const monoFont = "var(--font-geist-mono), ui-monospace, monospace";

function scaledTitleSize(type: CoverTypeScale, sizeId: CoverSizeId, title: string, tallBoost: number): number {
  const titleLength = Array.from(title).length;
  const titleScale = titleLength > 34 ? 0.68 : titleLength > 24 ? 0.78 : titleLength > 16 ? 0.88 : 1;
  return Math.round(type.titlePx * tallBoost * titleScale);
}

function CinematicComposition({ imageUrl, theme, size, sizeId, type, content, focalPoint }: CompositionProps) {
  const tall = sizeId === "xhs-3x4";
  const titleSize = scaledTitleSize(type, sizeId, content.title, tall ? 1.13 : 1);
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
        fontFamily: displayFont
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
          objectPosition: `${(focalPoint?.x ?? 0.5) * 100}% ${(focalPoint?.y ?? 0.5) * 100}%`,
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
              fontFamily: monoFont,
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
          <span style={{ fontFamily: monoFont }}>01</span>
        </div>
      </div>
    </div>
  );
}

/** Photo and copy each own their half — zero overlap, works for every ratio. */
function SplitComposition({ imageUrl, theme, size, sizeId, type, content, focalPoint }: CompositionProps) {
  const tall = size.cssHeight >= size.cssWidth;
  const titleSize = scaledTitleSize(type, sizeId, content.title, tall ? 1.13 : 1);

  const photo = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt=""
      crossOrigin="anonymous"
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: `${(focalPoint?.x ?? 0.5) * 100}% ${(focalPoint?.y ?? 0.5) * 100}%`,
        filter: "saturate(0.94) contrast(1.03)"
      }}
    />
  );

  const panel = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        boxSizing: "border-box",
        padding: `${size.cssHeight * 0.06}px ${size.cssWidth * 0.07}px`,
        background: "linear-gradient(160deg, #101318 0%, #0a0c10 100%)",
        overflow: "hidden"
      }}
    >
      <span
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
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
      <h1
        style={{
          margin: `${size.cssHeight * 0.03}px 0 0`,
          color: "#ffffff",
          fontSize: titleSize,
          lineHeight: 1.08,
          letterSpacing: "-0.03em",
          fontWeight: 900,
          whiteSpace: "pre-line",
          overflowWrap: "anywhere"
        }}
      >
        {content.title}
      </h1>
      <span style={{ display: "block", width: size.cssWidth * 0.1, height: Math.max(3, size.cssHeight * 0.007), borderRadius: 999, background: theme.accent, margin: `${size.cssHeight * 0.028}px 0` }} />
      <p style={{ margin: 0, color: "rgba(255,255,255,.72)", fontSize: type.bodyPx, fontWeight: 500, lineHeight: 1.5 }}>{content.highlight}</p>
      <div style={{ marginTop: size.cssHeight * 0.045, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderTop: "1px solid rgba(255,255,255,.16)", paddingTop: size.cssHeight * 0.02, color: "rgba(255,255,255,.5)", fontSize: type.metaPx }}>
        <span style={{ fontWeight: 650, letterSpacing: "0.06em" }}>FINFOLD · CONTENT STUDIO</span>
        <span style={{ fontFamily: monoFont }}>{content.meta}</span>
      </div>
    </div>
  );

  return (
    <div style={{ width: size.cssWidth, height: size.cssHeight, display: "flex", flexDirection: tall ? "column" : "row", background: "#07090c", color: "#ffffff", fontFamily: displayFont, overflow: "hidden" }}>
      <div style={tall ? { height: "56%", width: "100%", overflow: "hidden", flexShrink: 0 } : { width: "48%", height: "100%", overflow: "hidden", flexShrink: 0 }}>{photo}</div>
      <div style={tall ? { flex: 1, width: "100%", minHeight: 0 } : { flex: 1, height: "100%", minWidth: 0 }}>{panel}</div>
    </div>
  );
}

/** Rounded portrait window on paper — the title lives in a reserved safe zone. */
function PortraitWindowComposition({ imageUrl, theme, size, sizeId, type, content, focalPoint }: CompositionProps) {
  const tall = sizeId === "xhs-3x4" || size.cssHeight >= size.cssWidth;
  const titleSize = scaledTitleSize(type, sizeId, content.title, tall ? 1.05 : 0.96);
  const pad = size.cssWidth * 0.07;

  return (
    <div
      style={{
        width: size.cssWidth,
        height: size.cssHeight,
        background: theme.paper,
        backgroundImage: `radial-gradient(circle at 18% 12%, ${theme.paper2} 0%, ${theme.paper} 55%)`,
        color: theme.ink,
        fontFamily: displayFont,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        padding: `${size.cssHeight * 0.045}px ${pad}px ${size.cssHeight * 0.04}px`,
        overflow: "hidden"
      }}
    >
      <div
        style={{
          height: tall ? "52%" : "56%",
          flexShrink: 0,
          borderRadius: Math.round(size.cssWidth * 0.055),
          overflow: "hidden",
          border: `${Math.max(3, size.cssWidth * 0.008)}px solid ${theme.accentSoft}`,
          boxShadow: `0 ${size.cssWidth * 0.02}px ${size.cssWidth * 0.05}px rgba(15,18,15,.14)`
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          crossOrigin="anonymous"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: `${(focalPoint?.x ?? 0.5) * 100}% ${((focalPoint?.y ?? 0.42) * 100).toFixed(1)}%`
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: size.cssHeight * 0.03 }}>
        <span
          style={{
            display: "inline-flex",
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
        <span style={{ fontFamily: monoFont, fontSize: type.metaPx, letterSpacing: "0.08em", color: theme.muted, whiteSpace: "nowrap" }}>{content.meta}</span>
      </div>

      <div style={{ marginTop: size.cssHeight * 0.02 }}>
        <span style={{ display: "block", width: size.cssWidth * 0.1, height: Math.max(3, size.cssHeight * 0.007), borderRadius: 999, background: theme.accent, marginBottom: size.cssHeight * 0.016 }} />
        <h1 style={{ margin: 0, color: theme.ink, fontSize: titleSize, lineHeight: 1.12, letterSpacing: "-0.02em", fontWeight: 900, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{content.title}</h1>
        <p style={{ margin: `${size.cssHeight * 0.018}px 0 0`, color: theme.muted, fontSize: type.bodyPx, fontWeight: 500, lineHeight: 1.5 }}>{content.highlight}</p>
      </div>

      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderTop: `1px solid ${theme.line}`, paddingTop: size.cssHeight * 0.018, color: theme.muted, fontSize: type.metaPx }}>
        <span style={{ fontWeight: 650, letterSpacing: "0.06em" }}>FINFOLD · CONTENT STUDIO</span>
        <span style={{ fontFamily: monoFont }}>02</span>
      </div>
    </div>
  );
}

/** Photo on top, solid title band at the bottom — built for tall boards. */
function BottomBandComposition({ imageUrl, theme, size, sizeId, type, content, focalPoint }: CompositionProps) {
  const tall = size.cssHeight >= size.cssWidth;
  const titleSize = scaledTitleSize(type, sizeId, content.title, tall ? 1.08 : 1);
  const bandOn = theme.dark ? "#15100a" : "#ffffff";

  return (
    <div style={{ width: size.cssWidth, height: size.cssHeight, display: "flex", flexDirection: "column", background: "#07090c", color: bandOn, fontFamily: displayFont, overflow: "hidden" }}>
      <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          crossOrigin="anonymous"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: `${(focalPoint?.x ?? 0.5) * 100}% ${(focalPoint?.y ?? 0.42) * 100}%`,
            filter: "saturate(0.92) contrast(1.04)"
          }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(5,7,10,0) 55%, rgba(5,7,10,.34) 100%)" }} />
      </div>

      <div
        style={{
          flexShrink: 0,
          background: theme.accent,
          padding: `${size.cssHeight * 0.035}px ${size.cssWidth * 0.07}px ${size.cssHeight * 0.04}px`,
          boxSizing: "border-box"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: type.metaPx, fontWeight: 750, letterSpacing: "0.06em", color: bandOn, opacity: 0.82 }}>{content.kicker}</span>
          <span style={{ fontFamily: monoFont, fontSize: type.metaPx, letterSpacing: "0.08em", color: bandOn, opacity: 0.72, whiteSpace: "nowrap" }}>{content.meta}</span>
        </div>
        <h1 style={{ margin: `${size.cssHeight * 0.014}px 0 0`, color: bandOn, fontSize: titleSize, lineHeight: 1.08, letterSpacing: "-0.025em", fontWeight: 900, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{content.title}</h1>
        {content.highlight ? (
          <p style={{ margin: `${size.cssHeight * 0.014}px 0 0`, color: bandOn, opacity: 0.8, fontSize: type.bodyPx, fontWeight: 500, lineHeight: 1.45 }}>{content.highlight}</p>
        ) : null}
      </div>
    </div>
  );
}
