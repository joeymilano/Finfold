import type { VisualStoryPage, VisualStoryTheme } from "@/lib/visual-story";
import { visualStoryThemes } from "@/lib/visual-story";
import type { VisualStoryFormat } from "@/lib/visual-story-formats";
import type { Locale } from "@/lib/i18n";

type Props = {
  page: VisualStoryPage;
  pageIndex: number;
  pageCount: number;
  storyTitle: string;
  themeId: VisualStoryTheme;
  format: VisualStoryFormat;
  coverImageUrl?: string;
  paletteOverride?: {
    paper?: string;
    ink?: string;
    accent?: string;
  };
  locale: Locale;
};

type StoryThemeTokens = (typeof visualStoryThemes)[VisualStoryTheme];

type Layout = {
  landscape: boolean;
  compact: boolean;
  tall: boolean;
};

export function VisualStoryCanvas({ page, pageIndex, pageCount, storyTitle, themeId, format, coverImageUrl, paletteOverride, locale }: Props) {
  const theme: StoryThemeTokens = { ...visualStoryThemes[themeId], ...paletteOverride };
  const isPhotoCover = page.role === "cover" && Boolean(coverImageUrl);
  const displayNumber = String(pageIndex + 1).padStart(2, "0");
  const aspect = format.cssWidth / format.cssHeight;
  const layout: Layout = {
    landscape: aspect >= 1.35,
    compact: format.cssHeight <= 560,
    tall: aspect <= 0.63
  };
  // 中文方块字若套用西文式负字距，相邻笔画会相互挤压、视觉歪斜；
  // 中文也需要更宽松的行高，否则换行时上下行贴在一起、显得局促不齐。
  const cjk = locale === "zh";
  const safe = format.safeInsets;
  const paddingX = safe ? Math.max(46, safe.left / format.scale) : layout.landscape ? 34 : 46;
  const paddingTop = safe ? Math.max(48, safe.top / format.scale) : layout.landscape ? 26 : layout.compact ? 34 : 48;
  const paddingBottom = safe ? Math.max(38, safe.bottom / format.scale) : layout.landscape ? 24 : layout.compact ? 28 : 38;

  return (
    <div
      data-format={format.id}
      style={{
        width: format.cssWidth,
        height: format.cssHeight,
        position: "relative",
        overflow: "hidden",
        boxSizing: "border-box",
        background: theme.paper,
        color: theme.ink,
        fontFamily: "var(--font-geist-sans), 'Noto Sans SC', sans-serif"
      }}
    >
      {isPhotoCover ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverImageUrl}
            alt=""
            crossOrigin="anonymous"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "saturate(.82) contrast(1.08) brightness(.72)",
              transform: "scale(1.02)"
            }}
          />
          <div style={{ position: "absolute", inset: 0, background: layout.landscape ? "linear-gradient(90deg, rgba(5,8,14,.9), rgba(5,8,14,.2))" : "linear-gradient(180deg, rgba(5,8,14,.08), rgba(5,8,14,.94) 78%)" }} />
        </>
      ) : (
        <StoryAtmosphere themeId={themeId} theme={theme} />
      )}

      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: `${paddingTop}px ${paddingX}px ${paddingBottom}px`,
          boxSizing: "border-box",
          color: isPhotoCover ? "#ffffff" : theme.ink
        }}
      >
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: layout.landscape ? 22 : 28,
              borderRadius: 999,
              padding: layout.landscape ? "3px 9px" : "5px 12px",
              background: isPhotoCover ? "rgba(255,255,255,.16)" : theme.soft,
              color: isPhotoCover ? "rgba(255,255,255,.9)" : theme.accent,
              fontSize: layout.landscape ? 9 : 11,
              fontWeight: 760,
              letterSpacing: ".12em",
              textTransform: "uppercase"
            }}
          >
            {page.kicker || "FINFOLD STORY"}
          </span>
          <span style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: layout.landscape ? 9 : 11, letterSpacing: ".12em", opacity: .62 }}>
            {displayNumber}/{String(pageCount).padStart(2, "0")}
          </span>
        </header>

        <main style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
          {page.role === "cover" ? <CoverPage page={page} themeId={themeId} theme={theme} photo={isPhotoCover} layout={layout} cjk={cjk} /> : null}
          {page.role === "insight" ? <InsightPage page={page} themeId={themeId} theme={theme} layout={layout} cjk={cjk} /> : null}
          {page.role === "list" ? <ListPage page={page} themeId={themeId} theme={theme} layout={layout} cjk={cjk} /> : null}
          {page.role === "quote" ? <QuotePage page={page} theme={theme} layout={layout} /> : null}
          {page.role === "cta" ? <CtaPage page={page} themeId={themeId} theme={theme} layout={layout} cjk={cjk} /> : null}
        </main>

        <footer
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 18,
            paddingTop: layout.landscape ? 9 : layout.compact ? 14 : 20,
            borderTop: `1px solid ${isPhotoCover ? "rgba(255,255,255,.22)" : theme.soft}`,
            fontSize: layout.landscape ? 8 : 10,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            opacity: .65
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{storyTitle}</span>
          <span style={{ flexShrink: 0, fontWeight: 760 }}>FINFOLD</span>
        </footer>
      </div>
    </div>
  );
}

function StoryAtmosphere({ themeId, theme }: { themeId: VisualStoryTheme; theme: StoryThemeTokens }) {
  if (themeId === "signal") {
    return (
      <>
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 76% 14%, ${theme.accent}2e, transparent 34%), radial-gradient(circle at 10% 78%, ${theme.soft}, transparent 42%)` }} />
        <div style={{ position: "absolute", inset: 0, opacity: .12, backgroundImage: "linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
      </>
    );
  }
  if (themeId === "field-notes") {
    return (
      <>
        <div style={{ position: "absolute", top: -90, right: -70, width: 260, height: 260, borderRadius: "50%", border: `42px solid ${theme.accent}29` }} />
        <div style={{ position: "absolute", bottom: 88, left: 0, width: "100%", height: 1, background: "rgba(23,37,84,.16)" }} />
        <div style={{ position: "absolute", inset: 0, opacity: .16, backgroundImage: "linear-gradient(rgba(23,37,84,.2) 1px, transparent 1px)", backgroundSize: "100% 28px" }} />
      </>
    );
  }
  return (
    <>
      <div style={{ position: "absolute", top: 0, left: 0, width: 9, height: "100%", background: theme.accent }} />
      <div style={{ position: "absolute", top: -120, right: -100, width: 320, height: 320, borderRadius: "50%", background: `${theme.accent}1c` }} />
      <div style={{ position: "absolute", inset: 0, opacity: .12, backgroundImage: "radial-gradient(#171714 0.6px, transparent 0.6px)", backgroundSize: "6px 6px" }} />
    </>
  );
}

function CoverPage({ page, themeId, theme, photo, layout, cjk }: { page: VisualStoryPage; themeId: VisualStoryTheme; theme: StoryThemeTokens; photo: boolean; layout: Layout; cjk: boolean }) {
  const length = Array.from(page.title).length;
  const portraitSize = length > 48 ? 46 : length > 30 ? 53 : 62;
  const size = layout.landscape ? (length > 48 ? 30 : length > 30 ? 36 : 44) : layout.compact ? Math.min(portraitSize, 48) : portraitSize;
  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: layout.landscape ? "center" : "flex-end", paddingBottom: layout.landscape ? 8 : layout.compact ? 20 : 34 }}>
      <span style={{ width: layout.landscape ? 52 : 72, height: layout.landscape ? 5 : 7, borderRadius: 99, background: photo ? "#ffffff" : theme.accent, marginBottom: layout.landscape ? 14 : 24 }} />
      <h1 style={{ margin: 0, maxWidth: layout.landscape ? "76%" : "96%", fontFamily: themeId === "editorial" ? "var(--font-cover-serif), serif" : "inherit", fontSize: size, lineHeight: cjk ? 1.18 : 1.05, letterSpacing: cjk ? "normal" : "-.035em", fontWeight: themeId === "editorial" ? 560 : 880, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
        {page.title}
      </h1>
      {page.body ? <p style={{ margin: layout.landscape ? "12px 0 0" : "22px 0 0", maxWidth: layout.landscape ? "72%" : "88%", fontSize: layout.landscape ? 13 : 18, lineHeight: 1.55, opacity: .74 }}>{page.body}</p> : null}
      {page.emphasis ? <p style={{ margin: layout.landscape ? "12px 0 0" : "24px 0 0", color: photo ? "#ffffff" : theme.accent, fontSize: layout.landscape ? 11 : 15, fontWeight: 760 }}>{page.emphasis}</p> : null}
    </div>
  );
}

function InsightPage({ page, themeId, theme, layout, cjk }: { page: VisualStoryPage; themeId: VisualStoryTheme; theme: StoryThemeTokens; layout: Layout; cjk: boolean }) {
  const titleSize = layout.landscape ? (Array.from(page.title).length > 42 ? 27 : 34) : layout.compact ? 38 : Array.from(page.title).length > 42 ? 40 : 49;
  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", padding: layout.landscape ? "12px 0 16px" : layout.compact ? "20px 0 26px" : "28px 0 46px" }}>
      {page.emphasis ? <span style={{ color: theme.accent, fontSize: layout.landscape ? 10 : 14, fontWeight: 800, letterSpacing: cjk ? "normal" : ".04em", marginBottom: layout.landscape ? 10 : 20 }}>{page.emphasis}</span> : null}
      <h2 style={{ margin: 0, maxWidth: layout.landscape ? "82%" : "96%", fontFamily: themeId === "editorial" ? "var(--font-cover-serif), serif" : "inherit", fontSize: titleSize, lineHeight: cjk ? 1.25 : 1.14, letterSpacing: cjk ? "normal" : "-.025em", fontWeight: themeId === "editorial" ? 560 : 840 }}>{page.title}</h2>
      <p style={{ margin: layout.landscape ? "14px 0 0" : "32px 0 0", maxWidth: layout.landscape ? "86%" : "92%", fontSize: layout.landscape ? 13 : layout.compact ? 17 : 21, lineHeight: layout.landscape ? 1.45 : 1.68, color: theme.muted, whiteSpace: "pre-line" }}>{page.body}</p>
      <span style={{ marginTop: layout.landscape ? 14 : 40, width: "42%", height: 2, background: theme.accent }} />
    </div>
  );
}

function ListPage({ page, themeId, theme, layout, cjk }: { page: VisualStoryPage; themeId: VisualStoryTheme; theme: StoryThemeTokens; layout: Layout; cjk: boolean }) {
  const points = page.points.length > 0 ? page.points : page.body.split(/[\n；;]/).filter(Boolean).slice(0, 5);
  const titleSize = layout.landscape ? 27 : layout.compact ? 34 : Array.from(page.title).length > 40 ? 36 : 44;
  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column", paddingTop: layout.landscape ? 12 : layout.compact ? 22 : 34, minHeight: 0 }}>
      <h2 style={{ margin: 0, maxWidth: "95%", fontSize: titleSize, lineHeight: cjk ? 1.2 : 1.14, letterSpacing: cjk ? "normal" : "-.025em", fontWeight: 860 }}>{page.title}</h2>
      <div style={{ display: "grid", gridTemplateColumns: layout.landscape ? "repeat(2, minmax(0, 1fr))" : "1fr", gap: layout.landscape ? 7 : layout.compact ? 8 : 12, marginTop: layout.landscape ? 13 : layout.compact ? 18 : 30 }}>
        {points.map((point, index) => (
          <div key={`${point}-${index}`} style={{ display: "grid", gridTemplateColumns: layout.landscape ? "30px 1fr" : layout.compact ? "36px 1fr" : "44px 1fr", gap: layout.landscape ? 8 : 12, alignItems: "center", minHeight: layout.landscape ? 42 : layout.compact ? 50 : 72, borderRadius: layout.landscape ? 9 : 14, padding: layout.landscape ? "7px 9px" : layout.compact ? "8px 11px" : "13px 16px", background: theme.soft }}>
            <span style={{ display: "grid", width: layout.landscape ? 26 : layout.compact ? 32 : 38, height: layout.landscape ? 26 : layout.compact ? 32 : 38, placeItems: "center", borderRadius: layout.landscape ? 7 : 10, background: theme.accent, color: themeId === "field-notes" ? "#ffffff" : theme.paper, fontFamily: "var(--font-geist-mono), monospace", fontSize: layout.landscape ? 9 : 13, fontWeight: 850 }}>{String(index + 1).padStart(2, "0")}</span>
            <span style={{ fontSize: layout.landscape ? 10 : layout.compact ? 13 : 17, lineHeight: layout.landscape ? 1.3 : 1.48, fontWeight: 650 }}>{point}</span>
          </div>
        ))}
      </div>
      {page.body && page.points.length > 0 && !layout.landscape ? <p style={{ margin: layout.compact ? "12px 0 0" : "22px 0 0", color: theme.muted, fontSize: layout.compact ? 12 : 16, lineHeight: 1.55 }}>{page.body}</p> : null}
    </div>
  );
}

function QuotePage({ page, theme, layout }: { page: VisualStoryPage; theme: StoryThemeTokens; layout: Layout }) {
  const titleSize = layout.landscape ? 31 : layout.compact ? 38 : Array.from(page.title).length > 42 ? 39 : 48;
  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", paddingBottom: layout.landscape ? 10 : layout.compact ? 24 : 38 }}>
      <span style={{ color: theme.accent, fontFamily: "Georgia, serif", fontSize: layout.landscape ? 62 : layout.compact ? 82 : 112, lineHeight: .6, opacity: .82 }}>“</span>
      <h2 style={{ margin: layout.landscape ? "10px 0 0" : "20px 0 0", maxWidth: layout.landscape ? "82%" : "96%", fontFamily: "var(--font-cover-serif), serif", fontSize: titleSize, fontWeight: 560, lineHeight: 1.24, letterSpacing: ".01em" }}>{page.title}</h2>
      {page.body ? <p style={{ margin: layout.landscape ? "12px 0 0" : "28px 0 0", maxWidth: "86%", color: theme.muted, fontSize: layout.landscape ? 12 : layout.compact ? 14 : 17, lineHeight: 1.6 }}>{page.body}</p> : null}
      {page.emphasis ? <span style={{ marginTop: layout.landscape ? 12 : 34, color: theme.accent, fontSize: layout.landscape ? 10 : 14, fontWeight: 820 }}>{page.emphasis}</span> : null}
    </div>
  );
}

function CtaPage({ page, themeId, theme, layout, cjk }: { page: VisualStoryPage; themeId: VisualStoryTheme; theme: StoryThemeTokens; layout: Layout; cjk: boolean }) {
  const arrowSize = layout.landscape ? 60 : layout.compact ? 70 : 88;
  return (
    <div style={{ display: "flex", flex: 1, flexDirection: layout.landscape ? "row" : "column", justifyContent: "center", alignItems: layout.landscape ? "center" : "flex-start", gap: layout.landscape ? 26 : 0, paddingBottom: layout.landscape ? 6 : layout.compact ? 24 : 42 }}>
      <div style={{ width: arrowSize, height: arrowSize, flexShrink: 0, borderRadius: layout.landscape ? 16 : 22, display: "grid", placeItems: "center", background: theme.accent, color: themeId === "field-notes" ? "#fff" : theme.paper, fontSize: layout.landscape ? 22 : 30, fontWeight: 900 }}>→</div>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: layout.landscape ? 0 : layout.compact ? "22px 0 0" : "34px 0 0", maxWidth: layout.landscape ? "90%" : "96%", fontSize: layout.landscape ? 32 : layout.compact ? 39 : Array.from(page.title).length > 46 ? 41 : 52, lineHeight: cjk ? 1.2 : 1.12, letterSpacing: cjk ? "normal" : "-.03em", fontWeight: 880 }}>{page.title}</h2>
        {page.body ? <p style={{ margin: layout.landscape ? "11px 0 0" : "24px 0 0", maxWidth: "88%", color: theme.muted, fontSize: layout.landscape ? 12 : layout.compact ? 15 : 19, lineHeight: 1.6 }}>{page.body}</p> : null}
        {page.emphasis ? <span style={{ display: "inline-block", marginTop: layout.landscape ? 11 : 26, borderRadius: 999, padding: layout.landscape ? "6px 10px" : "10px 17px", background: theme.soft, color: theme.accent, fontSize: layout.landscape ? 9 : 13, fontWeight: 800 }}>{page.emphasis}</span> : null}
      </div>
    </div>
  );
}
