"use client";

import {
  BadgeCheck,
  Bot,
  CheckCircle2,
  ClipboardList,
  RadioTower,
  Sparkles,
  Star,
  TrendingUp,
  Wand2
} from "@/components/ui/icons";
import {
  CycleText,
  Parallax,
  ScoreTicker,
  TiltOnScroll,
  TypingText
} from "@/components/landing/motion-primitives";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import type { PlatformId } from "@/lib/platforms";

const platformDrafts: { platform: PlatformId; handle: string; score: number; body: string; tone: string }[] = [
  {
    platform: "x",
    handle: "@finfold",
    score: 94,
    body: "A launch note should not become fourteen manual rewrites. One source signal, every channel native.",
    tone: "bg-fg text-bg"
  },
  {
    platform: "linkedin",
    handle: "LinkedIn",
    score: 91,
    body: "Most small teams do not have a content problem. They have a translation problem.",
    tone: "bg-accent/15 text-accent"
  },
  {
    platform: "xiaohongshu",
    handle: "RED",
    score: 97,
    body: "把一次产品更新，变成每个平台都愿意读完的原生内容。",
    tone: "bg-risk/15 text-risk"
  }
];

const routeSteps = [
  { label: "Brand context", value: "private memory", icon: BadgeCheck },
  { label: "Publishable assets", value: "copy + visuals", icon: Wand2 },
  { label: "Results to rules", value: "next cycle ready", icon: TrendingUp }
];

/** Rotating product updates typed into the signal box, so the hero feels live. */
const SIGNAL_PHRASES = [
  "“We shipped dark mode, a cleaner workbench, and performance feedback for every generated post.”",
  "“May update: image generation is 2× faster, plus three new canvas formats for RED and X.”",
  "“Feedback Friday: founders told us the brand-score preview is the moment they trust the draft.”"
] as const;

const STATUS_WORDS = ["generating", "scoring drafts", "ready to post"] as const;

function ScoreBadge({ value, delay }: { value: number; delay?: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-positive/25 bg-positive/10 px-2 py-0.5 text-[10px] font-semibold text-positive">
      <Star className="h-2.5 w-2.5 fill-current" />
      <ScoreTicker value={value} delay={delay ?? 0.6} />
    </span>
  );
}

export function HeroMockup() {
  return (
    <TiltOnScroll>
      <div className="relative">
        <div className="pointer-events-none absolute -inset-x-8 bottom-0 top-10 -z-10 rounded-[2rem] bg-brand/10 blur-3xl" aria-hidden />

        <Parallax distance={26} className="absolute -left-3 top-16 z-20 hidden md:block">
          <div className="-rotate-3">
            <div className="panel rk-float flex items-center gap-2 px-3 py-2 shadow-raised">
              <RadioTower className="h-3.5 w-3.5 text-accent" />
              <span className="text-[11px] font-semibold text-fg">results feed the next cycle</span>
            </div>
          </div>
        </Parallax>

        <Parallax distance={-22} className="absolute -right-2 top-7 z-20 hidden sm:block">
          <div className="rotate-2">
            <div className="panel rk-float-slow flex items-center gap-2 px-3 py-2 shadow-raised">
              <Sparkles className="h-3.5 w-3.5 text-brand" />
              <span className="text-[11px] font-semibold text-fg">Agent connected</span>
            </div>
          </div>
        </Parallax>

        <div className="hero-console overflow-hidden rounded-[1.5rem] border border-white/10 bg-[rgb(8_11_18/0.55)] shadow-[0_32px_120px_-46px_rgb(0_0_0/0.95)] backdrop-blur-2xl">
          <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-risk/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-warn/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-positive/75" />
            </div>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.24em] text-fg-muted">
                Finfold launch room
              </p>
            </div>
            <div className="hidden items-center gap-1.5 rounded-full border border-positive/20 bg-positive/10 px-2.5 py-1 text-[10px] font-semibold text-positive sm:flex">
              <span className="status-dot" />
              <CycleText words={STATUS_WORDS} />
            </div>
          </div>

          <div className="grid gap-4 p-4 lg:grid-cols-[0.9fr_1.2fr_0.9fr] lg:p-5">
            <section className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand">
                    <ClipboardList className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-fg">Product signal</p>
                    <p className="text-[11px] text-fg-muted">One update pasted</p>
                  </div>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-fg-muted">
                  live input
                </span>
              </div>

              <div className="min-h-[5.5rem] rounded-xl border border-white/10 bg-bg/60 p-3.5">
                <p className="text-sm font-medium leading-6 text-fg">
                  <TypingText phrases={SIGNAL_PHRASES} />
                </p>
              </div>

              <div className="mt-4 space-y-2.5">
                {["warm founder voice", "no hype words", "global + China channels"].map((chip) => (
                  <div key={chip} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" />
                    <span className="text-[12px] font-medium text-fg">{chip}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="relative overflow-hidden rounded-2xl border border-brand/25 bg-[radial-gradient(circle_at_50%_0%,rgb(var(--brand)/0.18),transparent_44%),rgb(10_14_22/0.62)] p-4 text-left">
              <div className="absolute inset-x-8 top-24 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent" aria-hidden />

              <div className="relative z-10 flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">Marketing operating layer</p>
                  <h2 className="mt-2 text-2xl font-semibold text-fg sm:text-3xl">Generate. Publish. Learn.</h2>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-strong to-accent text-bg shadow-glow-brand">
                  <Bot className="h-5 w-5" />
                </span>
              </div>

              <div className="relative z-10 mt-8 grid gap-3 sm:grid-cols-3">
                {routeSteps.map((step, index) => (
                  <div key={step.label} className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] text-brand">
                        <step.icon className="h-4 w-4" />
                      </span>
                      <span className="tabular text-[11px] text-fg-muted">0{index + 1}</span>
                    </div>
                    <p className="text-[12px] font-semibold text-fg">{step.label}</p>
                    <p className="mt-1 text-[11px] text-fg-muted">{step.value}</p>
                  </div>
                ))}
              </div>

              <div className="relative z-10 mt-4 rounded-2xl border border-white/10 bg-bg/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="status-dot" />
                    <p className="text-sm font-semibold text-fg">Growth cycle</p>
                  </div>
                  <span className="text-[11px] text-fg-muted">90 sec</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="rk-progress h-full rounded-full bg-gradient-to-r from-brand via-accent to-positive" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    [6, "assets"],
                    [3, "channels"],
                    [1, "next rule"]
                  ].map(([value, label]) => (
                    <div key={label as string} className="rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2">
                      <p className="tabular text-lg font-semibold text-fg">
                        <ScoreTicker value={value as number} delay={0.9} />
                      </p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-fg-muted">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-fg">Publishable set</p>
                  <p className="text-[11px] text-fg-muted">Copy + visual direction</p>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <Wand2 className="h-4 w-4" />
                </span>
              </div>

              <div className="space-y-3">
                {platformDrafts.map((draft, i) => (
                  <article key={draft.platform} className="rounded-2xl border border-white/10 bg-bg/60 p-3">
                    <header className="mb-2.5 flex items-center gap-2">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${draft.tone}`}>
                        <PlatformGlyph platform={draft.platform} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-fg">{draft.handle}</p>
                        <p className="text-[10px] text-fg-muted">native draft</p>
                      </div>
                      <ScoreBadge value={draft.score} delay={0.5 + i * 0.22} />
                    </header>
                    <p className="text-[12px] leading-5 text-fg-muted">{draft.body}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </TiltOnScroll>
  );
}
