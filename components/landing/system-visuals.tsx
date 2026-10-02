import {
  Check,
  ClipboardList,
  Sparkles,
  Star
} from "@/components/ui/icons";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import type { PlatformId } from "@/lib/platforms";
import type { Locale } from "@/lib/i18n";

/**
 * System-section visuals — concrete, product-UI-style mockups that replace the
 * earlier abstract render art. Each is self-contained presentational JSX built
 * from the same design tokens as the app, so it reads like a real screenshot
 * rather than generated hero art. Labels are localized to match the page.
 */

/* ------------------------------------------------------------------ */
/* 1. Fan-out — one update rewritten into native drafts (centerpiece)  */
/* ------------------------------------------------------------------ */
const fanDrafts: { platform: PlatformId; handleZh: string; handleEn: string; score: number; body: string; tone: string }[] = [
  {
    platform: "xiaohongshu",
    handleZh: "小红书",
    handleEn: "RED",
    score: 97,
    body: "上新｜workbench 更快了，这 3 个细节值得说 ✨",
    tone: "bg-risk/15 text-risk"
  },
  {
    platform: "x",
    handleZh: "@finfold",
    handleEn: "@finfold",
    score: 94,
    body: "One update. Eleven platforms. Zero rewrites.",
    tone: "bg-fg text-bg"
  },
  {
    platform: "linkedin",
    handleZh: "LinkedIn",
    handleEn: "LinkedIn",
    score: 91,
    body: "Most small teams don't have a content problem — they have a distribution one.",
    tone: "bg-accent/15 text-accent"
  }
];

function ScoreBadge({ value }: { value: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-positive/25 bg-positive/10 px-2 py-0.5 text-[10px] font-semibold text-positive">
      <Star className="h-2.5 w-2.5 fill-current" />
      {value}
    </span>
  );
}

export function FanOutVisual({ locale }: { locale: Locale }) {
  const en = locale === "en";
  return (
    <div className="flex flex-col gap-3">
      {/* Source update */}
      <div className="rounded-2xl border border-hairline bg-bg/50 p-4">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-brand">
            <ClipboardList className="h-4 w-4" />
          </span>
          <p className="text-sm font-semibold text-fg">{en ? "The update you paste" : "你粘进来的一条更新"}</p>
          <span className="ml-auto rounded-full border border-hairline bg-surface px-2 py-0.5 text-[10px] text-fg-muted">
            1 paste
          </span>
        </div>
        <p className="rounded-xl border border-hairline bg-surface/60 p-3 text-[13px] leading-6 text-fg">
          “We shipped dark mode + a faster workbench, with a brand score on every post.”
        </p>
      </div>

      {/* Connector */}
      <div className="flex items-center justify-center gap-2 text-[11px] font-medium text-fg-muted">
        <span className="h-px w-8 bg-hairline" />
        <span className="inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-brand" />
          {en ? "auto-rewritten into each platform's own voice" : "自动改写成每个平台的地道说法"}
        </span>
        <span className="h-px w-8 bg-hairline" />
      </div>

      {/* Native drafts */}
      <div className="space-y-2.5">
        {fanDrafts.map((draft) => (
          <article key={draft.platform} className="rounded-2xl border border-hairline bg-surface/60 p-3">
            <header className="mb-2 flex items-center gap-2">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${draft.tone}`}>
                <PlatformGlyph platform={draft.platform} className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-fg">{en ? draft.handleEn : draft.handleZh}</p>
                <p className="text-[10px] text-fg-muted">{en ? "native draft · ready to post" : "原生草稿 · 可直接发"}</p>
              </div>
              <ScoreBadge value={draft.score} />
            </header>
            <p className="text-[12px] leading-5 text-fg-muted">{draft.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Workspace — one place for updates, drafts, insights (compact)    */
/* ------------------------------------------------------------------ */
const boardColumns: { labelZh: string; labelEn: string; rows: { text: string; tone: string }[] }[] = [
  {
    labelZh: "更新",
    labelEn: "Updates",
    rows: [
      { text: "Dark mode", tone: "bg-brand/50" },
      { text: "Faster load", tone: "bg-brand/30" }
    ]
  },
  {
    labelZh: "待发",
    labelEn: "To ship",
    rows: [
      { text: "RED · 97", tone: "bg-risk/40" },
      { text: "X · 94", tone: "bg-fg/30" }
    ]
  },
  {
    labelZh: "反馈",
    labelEn: "Signals",
    rows: [
      { text: "Thu 16:00 best", tone: "bg-positive/40" },
      { text: "+18% reach", tone: "bg-positive/25" }
    ]
  }
];

export function WorkspaceVisual({ locale }: { locale: Locale }) {
  const en = locale === "en";
  return (
    <div className="rounded-xl border border-hairline bg-bg/40 p-3">
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-risk/70" />
        <span className="h-2 w-2 rounded-full bg-warn/80" />
        <span className="h-2 w-2 rounded-full bg-positive/75" />
        <span className="ml-1.5 text-[11px] font-semibold text-fg">Finfold</span>
        <span className="ml-auto rounded-full border border-hairline bg-surface px-2 py-0.5 text-[9px] uppercase tracking-wider text-fg-muted">
          this week
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {boardColumns.map((col) => (
          <div key={col.labelEn} className="rounded-lg border border-hairline bg-surface/60 p-2">
            <p className="mb-1.5 text-[10px] font-semibold text-fg-muted">{en ? col.labelEn : col.labelZh}</p>
            <div className="space-y-1.5">
              {col.rows.map((row) => (
                <div key={row.text} className="rounded-md bg-surface-2 px-1.5 py-1">
                  <span className={`mb-1 block h-1 w-6 rounded-full ${row.tone}`} />
                  <span className="block truncate text-[9.5px] text-fg">{row.text}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Brand memory — voice + banned words (compact)                    */
/* ------------------------------------------------------------------ */
export function BrandChipsVisual({ locale }: { locale: Locale }) {
  const en = locale === "en";
  const voice = en ? ["warm", "direct", "no hype"] : ["温暖", "直接", "不吹嘘"];
  const banned = en ? ["hype", "revolutionary", "seamless"] : ["颠覆", "革命性", "无缝"];
  return (
    <div className="space-y-2.5 rounded-xl border border-hairline bg-bg/40 p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-strong to-brand text-bg">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <p className="text-[12px] font-semibold text-fg">{en ? "Brand memory" : "品牌记忆"}</p>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-positive/25 bg-positive/10 px-2 py-0.5 text-[9.5px] font-semibold text-positive">
          <Check className="h-2.5 w-2.5" /> {en ? "remembered" : "已记住"}
        </span>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{en ? "Voice" : "语气"}</p>
        <div className="flex flex-wrap gap-1.5">
          {voice.map((t) => (
            <span key={t} className="inline-flex items-center rounded-md bg-brand/12 px-2 py-0.5 text-[11px] font-medium text-brand">
              {t}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{en ? "Never say" : "不能说"}</p>
        <div className="flex flex-wrap gap-1.5">
          {banned.map((t) => (
            <span key={t} className="inline-flex items-center rounded-md border border-risk/25 bg-risk/10 px-2 py-0.5 text-[11px] font-medium text-risk line-through decoration-risk/70">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
