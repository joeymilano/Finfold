import {
  Bot,
  CalendarDays,
  Check,
  Sparkles,
  TriangleAlert,
  Zap
} from "@/components/ui/icons";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import type { PlatformId } from "@/lib/platforms";

/**
 * Feature-section visuals — three hand-built mockups that sit beside the
 * narrative copy. Each one is self-contained presentational JSX so it can
 * be placed left or right of its text column and stays crisp at any size.
 */

/* 平台品牌字形统一使用 PlatformGlyph（见 components/workbench/PlatformBrandIcon） */

/* ------------------------------------------------------------------ */
/* 1. Brand Memory                                                     */
/* ------------------------------------------------------------------ */
export function BrandMemoryVisual() {
  const banned = ["revolutionary", "game-changing", "synergy", "seamless"];
  return (
    <div className="panel rk-enter overflow-hidden rounded-2xl p-5 shadow-raised sm:p-6">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-strong to-brand text-bg">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-fg">Brand Memory</p>
            <p className="text-[11px] text-fg-muted">Maya · founder-voice</p>
          </div>
        </div>
        <span className="tag tag-success"><Check className="h-3 w-3" /> synced</span>
      </header>

      <dl className="space-y-3.5">
        <div>
          <dt className="eyebrow mb-1.5">Voice</dt>
          <dd className="flex flex-wrap gap-1.5">
            {["warm", "direct", "no hype", "founder-to-founder"].map((t) => (
              <span key={t} className="tag tag-brand">{t}</span>
            ))}
          </dd>
        </div>

        <div>
          <dt className="eyebrow mb-1.5">Audience</dt>
          <dd className="text-[13px] text-fg">Indie founders, 25–40, shipping in public.</dd>
        </div>

        <div>
          <dt className="eyebrow mb-1.5">Banned words</dt>
          <dd className="flex flex-wrap gap-1.5">
            {banned.map((t) => (
              <span key={t} className="inline-flex items-center rounded-md border border-risk/25 bg-risk/10 px-2 py-0.5 text-[11px] font-medium text-risk line-through decoration-risk/70">
                {t}
              </span>
            ))}
          </dd>
        </div>

        <div className="panel-inset rounded-lg p-3">
          <dt className="eyebrow mb-1.5">Approved example</dt>
          <dd className="text-[13px] italic leading-relaxed text-fg">
            “Built for the 2am founder.”
          </dd>
        </div>
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Platform unwritten rules                                        */
/* ------------------------------------------------------------------ */
const RULES: { id: string; platform: PlatformId; rule: string; tone: "brand" | "accent" | "risk" | "positive" }[] = [
  { id: "x", platform: "x", rule: "Line 1 alone decides your reach.", tone: "brand" },
  { id: "li", platform: "linkedin", rule: "Opening with “I” quietly demotes you.", tone: "accent" },
  { id: "xhs", platform: "xiaohongshu", rule: "Hard line break every 1–3 lines, always.", tone: "risk" },
  { id: "rd", platform: "reddit", rule: "Drop a product name in r/startups → removed.", tone: "positive" }
];

const toneRing: Record<string, string> = {
  brand: "bg-brand/15 text-brand",
  accent: "bg-accent/15 text-accent",
  risk: "bg-risk/15 text-risk",
  positive: "bg-positive/15 text-positive"
};

export function PlatformRulesVisual() {
  return (
    <div className="panel rk-enter rk-delay-1 overflow-hidden rounded-2xl p-5 shadow-raised sm:p-6">
      <header className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-risk/15 text-risk">
          <TriangleAlert className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-fg">Unwritten rules</p>
          <p className="text-[11px] text-fg-muted">Baked into the generation engine</p>
        </div>
      </header>

      <ul className="space-y-2.5">
        {RULES.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl border border-hairline bg-surface/70 px-3 py-2.5">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${toneRing[r.tone]}`}>
              <PlatformGlyph platform={r.platform} className="h-3.5 w-3.5" />
            </span>
            <p className="text-[12.5px] leading-snug text-fg">{r.rule}</p>
          </li>
        ))}
      </ul>

      <p className="mt-3.5 text-[11px] leading-relaxed text-fg-muted">
        Researched across 14 platforms. Every draft is scored against them before it reaches you.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. AI Agent — weekly plan                                          */
/* ------------------------------------------------------------------ */
export function AgentVisual() {
  const plan = [
    { day: "Tue", ch: "LinkedIn", time: "9:00", hot: true },
    { day: "Thu", ch: "X", time: "16:00", hot: true },
    { day: "Sun", ch: "Reddit", time: "20:00", hot: false }
  ];
  return (
    <div className="panel rk-enter rk-delay-2 overflow-hidden rounded-2xl p-5 shadow-raised sm:p-6">
      <header className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-brand text-bg">
          <Bot className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-fg">AI Marketing Employee</p>
          <p className="text-[11px] text-fg-muted">Planning your week</p>
        </div>
        <span className="ml-auto tag tag-accent"><Zap className="h-3 w-3" /> live</span>
      </header>

      {/* Chat thread */}
      <div className="mb-4 flex justify-end">
        <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand/15 px-3.5 py-2 text-[12.5px] text-fg">
          What should I post this week?
        </p>
      </div>
      <div className="mb-4 flex">
        <p className="max-w-[88%] rounded-2xl rounded-bl-sm border border-hairline bg-surface px-3.5 py-2 text-[12.5px] leading-relaxed text-fg-muted">
          Your X engagement peaks Thu 4pm. LinkedIn likes Tuesday mornings. Here is the plan:
        </p>
      </div>

      {/* Plan rows */}
      <ul className="space-y-2">
        {plan.map((p) => (
          <li
            key={p.day}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
              p.hot ? "border-brand/40 bg-brand/10" : "border-hairline bg-surface/70"
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-fg-muted">
              <CalendarDays className="h-3.5 w-3.5" />
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="text-[12px] font-semibold text-fg">{p.day}</span>
              <span className="text-fg-muted">·</span>
              <span className="truncate text-[12px] text-fg">{p.ch}</span>
            </div>
            <span className="tabular text-[11px] text-fg-muted">{p.time}</span>
            {p.hot && <span className="status-dot" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
