"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInView } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Heart,
  Lock,
  MessageCircle,
  PanelRight,
  RefreshCcw,
  ScanLine,
  Send,
  ShieldCheck,
  Star,
  WandSparkles
} from "@/components/ui/icons";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { TrackedCtaLink } from "@/components/marketing/TrackedCtaLink";
import {
  Reveal,
  Stagger,
  StaggerItem,
  TiltOnScroll,
  useHydratedReducedMotion
} from "@/components/landing/motion-primitives";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import type { Locale } from "@/lib/i18n";

/**
 * Chrome extension showcase — sits right after the four-step flow, closing
 * the narrative loop "…and the last mile happens inside your browser".
 *
 * The centerpiece is a hand-built browser stage (same convention as
 * feature-visuals.tsx: presentational JSX, crisp at any size, no binary
 * assets) that loops the reply-assistant story: comment captured → reply
 * typed → one confirm → sent. The loop is driven by a single elapsed-time
 * counter so every derived state is deterministic and pauses when the stage
 * leaves the viewport or reduced motion is requested.
 */

const DOWNLOAD_HREF = "/extension/download";

/* ------------------------------------------------------------------ */
/*  Copy — bilingual, self-contained like CurrentOpsCostCalculator     */
/* ------------------------------------------------------------------ */
const copy = {
  zh: {
    eyebrow: "FINFOLD FOR CHROME · 装进浏览器的增长助手",
    title: "评论区的事 就在评论区解决",
    sub: "在自己帖子页打开侧栏：评论自动抓取、回复自动生成，你确认之后才自动发送。任意网页也能一键变成四个平台的发布稿。",
    pilotTag: "回复助手 · 公测",
    versionTag: "v1.1.4 · 约 200 KB",
    cta: "安装 Finfold for Chrome",
    freeNote: "安装免费 · 首次生成免费 · Chrome 114+",
    trustLine: "无后台常驻 · 只读你打开的页面 · 每条回复都经你确认",
    capabilities: [
      {
        icon: MessageCircle,
        title: "评论自动抓取",
        body: "打开侧栏，当前帖子的评论自动整理进面板，不用来回复制粘贴"
      },
      {
        icon: Send,
        title: "确认后自动发送",
        body: "每条回复都由你按下确认，再自动定位输入框填写发送，视觉模型兜底"
      },
      {
        icon: WandSparkles,
        title: "网页变发布稿",
        body: "选中的段落或整页内容，改成 X / LinkedIn / 小红书 / Reddit 原生帖子"
      },
      {
        icon: ShieldCheck,
        title: "隐私边界清晰",
        body: "无常驻脚本，只在你主动使用时读取当前页面，也绝不静默发送"
      }
    ],
    stage: {
      tab: "小红书 · 笔记详情",
      url: "xiaohongshu.com/explore/update-to-note",
      author: "Maya 的出海手记",
      time: "2 小时前",
      post: "把每次产品更新写成小红书笔记的第 3 周：单篇最高带来 214 个注册",
      chartLabel: "本周注册 214",
      likes: "512 赞 · 128 收藏 · 36 评论",
      comments: [
        { author: "阿茶", time: "1 小时前", text: "请问封面上的数据图是用什么工具画的？" },
        { author: "Leo", time: "46 分钟前", text: "团队里多人可以一起用吗？" },
        { author: "Momo", time: "32 分钟前", text: "收藏了，等我试完来回帖" }
      ],
      panelKicker: "FINFOLD FOR CHROME",
      panelTitle: "回复助手",
      capturedLabel: "已抓取 3 条评论 · 选中第 1 条",
      replyLabel: "生成回复",
      reply: "用 Finfold 自带的图表模板，替换数字就能导出；完整教程在我主页置顶，可以去看看",
      visionLine: "DOM 定位 · 视觉兜底 GLM-5.3-flash · 每条回复需你确认",
      confirm: "确认并发送",
      sending: "正在发送…",
      sent: "已回复 · 自动发送完成",
      capturedTag: "已抓取",
      repliedTag: "已回复"
    }
  },
  en: {
    eyebrow: "FINFOLD FOR CHROME · THE BROWSER RESIDENT",
    title: "Replies happen where the comments are",
    sub: "Open the side panel on your own post — comments are captured, replies are drafted, and nothing sends until you confirm. Any page can also become native drafts for four platforms.",
    pilotTag: "Reply assistant · open beta",
    versionTag: "v1.1.4 · ~200 KB",
    cta: "Install Finfold for Chrome",
    freeNote: "Free to install · first generation free · Chrome 114+",
    trustLine: "No background scripts · reads only the page you open · every reply confirmed by you",
    capabilities: [
      {
        icon: MessageCircle,
        title: "Auto-captured comments",
        body: "Open the panel and the comments under your post are organized and waiting"
      },
      {
        icon: Send,
        title: "One-confirm sending",
        body: "Every reply needs your click, then it locates the input and sends — vision model as backup"
      },
      {
        icon: WandSparkles,
        title: "Page to native post",
        body: "A selected passage or the whole page, rewritten for X / LinkedIn / RED / Reddit"
      },
      {
        icon: ShieldCheck,
        title: "Privacy by design",
        body: "No resident scripts, reads only the page you open, and never sends silently"
      }
    ],
    stage: {
      tab: "RED · post",
      url: "xiaohongshu.com/explore/update-to-note",
      author: "Maya ships it",
      time: "2h ago",
      post: "Week 3 of turning product updates into RED notes — one post brought 214 signups",
      chartLabel: "Signups this week: 214",
      likes: "512 likes · 128 saves · 36 comments",
      comments: [
        { author: "Acha", time: "1h ago", text: "What did you use for the chart on the cover?" },
        { author: "Leo", time: "46m ago", text: "Can the whole team use it together?" },
        { author: "Momo", time: "32m ago", text: "Saved. Will report back after I try it" }
      ],
      panelKicker: "FINFOLD FOR CHROME",
      panelTitle: "Reply assistant",
      capturedLabel: "3 comments captured · replying to #1",
      replyLabel: "Draft reply",
      reply: "Finfold's built-in chart templates — swap the numbers and export. Full tutorial is pinned on my profile",
      visionLine: "DOM locate · GLM-5.3-flash vision backup · every reply needs your confirm",
      confirm: "Confirm & send",
      sending: "Sending…",
      sent: "Replied · sent automatically",
      capturedTag: "Captured",
      repliedTag: "Replied"
    }
  }
} as const;

/* ------------------------------------------------------------------ */
/*  Reply-loop clock — one elapsed counter drives every derived state  */
/* ------------------------------------------------------------------ */
const CAPTURE_AT = 900;
const TYPE_START = 1700;
const TYPE_MS_PER_CHAR = 30;
const READY_PAD = 450;
const READY_HOLD = 1900;
const SEND_MS = 1100;
const SENT_HOLD = 3400;

function useReplyStageClock(replyLength: number) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useHydratedReducedMotion();
  const inView = useInView(ref, { amount: 0.35 });
  const [elapsed, setElapsed] = useState(0);

  const marks = useMemo(() => {
    const readyAt = TYPE_START + replyLength * TYPE_MS_PER_CHAR + READY_PAD;
    const sendingAt = readyAt + READY_HOLD;
    const sentAt = sendingAt + SEND_MS;
    const cycle = sentAt + SENT_HOLD;
    return { readyAt, sendingAt, sentAt, cycle };
  }, [replyLength]);

  useEffect(() => {
    if (reduce || !inView) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed((Date.now() - startedAt) % marks.cycle);
    }, 90);
    return () => window.clearInterval(timer);
  }, [inView, reduce, marks.cycle]);

  // Reduced motion settles on the finished state so the mockup still tells
  // the whole story, just without the loop.
  const t = reduce ? marks.cycle : elapsed;
  return {
    ref,
    captured: t >= CAPTURE_AT,
    typedChars: Math.max(0, Math.min(replyLength, Math.floor((t - TYPE_START) / TYPE_MS_PER_CHAR))),
    ready: t >= marks.readyAt,
    sending: t >= marks.sendingAt && t < marks.sentAt,
    sent: t >= marks.sentAt
  };
}

/* ------------------------------------------------------------------ */
/*  Browser stage                                                     */
/* ------------------------------------------------------------------ */
function ExtensionStage({ locale }: { locale: Locale }) {
  const s = copy[locale].stage;
  const replyLength = s.reply.length;
  const { ref, captured, typedChars, ready, sending, sent } = useReplyStageClock(replyLength);
  const replySlice = s.reply.slice(0, typedChars);
  const typing = typedChars > 0 && typedChars < replyLength;

  return (
    <div ref={ref} aria-hidden="true" className="relative mx-auto w-full max-w-5xl">
      {/* warm pool of studio light behind the instrument */}
      <span className="pointer-events-none absolute -inset-x-10 -top-12 bottom-0 rounded-[56px] bg-[radial-gradient(58%_60%_at_50%_18%,rgb(var(--brand)/0.1),transparent_72%)]" />
      <TiltOnScroll>
        <div className="panel relative overflow-hidden rounded-2xl shadow-raised">
          {/* --- window chrome: traffic lights + tabs --- */}
          <div className="flex items-center gap-3 border-b border-hairline bg-surface-2/70 px-3 py-2 sm:px-4">
            <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/70" />
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1">
              <span className="flex min-w-0 items-center gap-2 rounded-t-lg border border-b-0 border-hairline bg-bg px-3 py-1.5">
                <PlatformGlyph platform="xiaohongshu" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate text-[11px] text-fg-muted">{s.tab}</span>
              </span>
              <span className="hidden min-w-0 items-center gap-2 rounded-t-lg px-3 py-1.5 opacity-50 sm:flex">
                <FishLogo variant="mark" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate text-[11px] text-fg-muted">Finfold</span>
              </span>
            </span>
          </div>
          {/* --- omnibox --- */}
          <div className="flex items-center gap-2.5 border-b border-hairline bg-bg/80 px-3 py-2 sm:gap-3 sm:px-4">
            <span className="hidden shrink-0 items-center gap-2 text-fg-muted/50 sm:flex">
              <ArrowLeft className="h-3.5 w-3.5" />
              <ArrowRight className="h-3.5 w-3.5" />
              <RefreshCcw className="h-3 w-3" />
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-hairline bg-surface/70 px-3 py-1">
              <Lock className="h-3 w-3 shrink-0 text-positive" />
              <span className="truncate font-mono text-[11px] text-fg-muted">{s.url}</span>
            </span>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
              <PanelRight className="h-3.5 w-3.5" />
            </span>
          </div>

          {/* --- viewport: the page + the side panel --- */}
          <div className="grid md:grid-cols-[1.12fr_1fr]">
            {/* the page (desktop) */}
            <div className="relative hidden overflow-hidden border-r border-hairline bg-[#100e0b] p-4 md:block lg:p-5">
              <article className="rounded-xl border border-hairline bg-surface/60 p-4">
                <header className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-strong to-brand text-[11px] font-semibold text-bg">
                    M
                  </span>
                  <span className="leading-tight">
                    <span className="block text-[13px] font-semibold text-fg">{s.author}</span>
                    <span className="block text-[11px] text-fg-muted">{s.time}</span>
                  </span>
                </header>
                <p className="mt-3 text-[13px] leading-6 text-fg">{s.post}</p>
                {/* cover chart */}
                <div className="relative mt-3 overflow-hidden rounded-lg border border-hairline bg-gradient-to-br from-brand/[0.09] via-surface-2 to-bg-inset p-3.5">
                  <div className="flex h-16 items-end gap-1.5">
                    {[34, 48, 40, 62, 55, 78, 100].map((h, i) => (
                      <span
                        key={i}
                        style={{ height: `${h}%` }}
                        className={`w-full rounded-sm ${i === 6 ? "bg-gradient-to-t from-brand to-brand-strong" : "bg-brand/25"}`}
                      />
                    ))}
                  </div>
                  <span className="absolute right-3 top-3 font-mono text-[10px] tracking-wide text-brand">{s.chartLabel}</span>
                </div>
                <footer className="mt-3 flex items-center gap-4 text-[11px] text-fg-muted">
                  <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{s.likes.split("·")[0]}</span>
                  <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" />{s.likes.split("·")[1]}</span>
                  <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{s.likes.split("·")[2]}</span>
                </footer>
              </article>

              {/* comments — the first one is the captured target */}
              <ul className="mt-4 space-y-2.5">
                {s.comments.map((comment, i) => {
                  const isTarget = i === 0;
                  const active = isTarget && captured;
                  return (
                    <li
                      key={comment.author}
                      className={`relative rounded-xl border p-3 transition-all duration-700 ${
                        active
                          ? sent
                            ? "border-positive/40 bg-positive/[0.05]"
                            : "border-brand/60 bg-brand/[0.06] shadow-glow-brand"
                          : "border-hairline bg-surface/40"
                      }`}
                    >
                      {active && !sent && (
                        <span className="tag tag-brand absolute -top-2.5 right-3 !py-0.5 !text-[10px]">
                          <ScanLine className="h-3 w-3" /> {s.capturedTag}
                        </span>
                      )}
                      {isTarget && sent && (
                        <span className="tag tag-success absolute -top-2.5 right-3 !py-0.5 !text-[10px]">
                          <Check className="h-3 w-3" /> {s.repliedTag}
                        </span>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-[9px] font-semibold text-fg-muted">
                          {comment.author.charAt(0)}
                        </span>
                        <span className="text-[11px] font-medium text-fg/90">{comment.author}</span>
                        <span className="text-[10px] text-fg-muted/70">{comment.time}</span>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-5 text-fg/85">{comment.text}</p>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* the extension side panel */}
            <div className="flex min-h-[330px] flex-col bg-bg p-4 sm:p-5">
              <header className="flex items-center gap-2.5">
                <FishLogo variant="mark" className="h-7 w-7 shrink-0" />
                <span className="leading-tight">
                  <span className="block text-sm font-semibold text-fg">{s.panelTitle}</span>
                  <span className="block font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-muted">{s.panelKicker}</span>
                </span>
                <span className="tag tag-neutral ml-auto !text-[10px]">
                  <span className="status-dot" /> ready
                </span>
              </header>

              {/* captured comment chip */}
              <div
                className={`mt-4 rounded-xl border p-3 transition-all duration-700 ${
                  captured ? "border-brand/40 bg-brand/[0.06] opacity-100" : "border-hairline bg-surface/40 opacity-35"
                }`}
              >
                <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-brand/90">{s.capturedLabel}</p>
                <p className="mt-1.5 text-[12px] leading-5 text-fg/90">“{s.comments[0].text}”</p>
              </div>

              {/* generated reply */}
              <div className="mt-3 min-h-[5.6rem] rounded-xl border border-hairline bg-surface/50 p-3">
                <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-muted">
                  <WandSparkles className="h-3 w-3 text-brand" /> {s.replyLabel}
                </p>
                <p className={`mt-1.5 text-[12.5px] leading-5 text-fg ${typing ? "" : "transition-opacity duration-500"} ${typedChars === 0 ? "opacity-25" : "opacity-100"}`}>
                  {typedChars === 0 ? "—" : replySlice}
                  {typing && <span className="typing-caret" />}
                </p>
              </div>

              {/* tiered-send footer note */}
              <p className="mt-3 flex items-center gap-1.5 font-mono text-[9.5px] leading-4 text-fg-muted/75">
                <ScanLine className="h-3 w-3 shrink-0" /> {s.visionLine}
              </p>

              {/* confirm & send */}
              <div className="mt-auto flex h-11 pt-4">
                {sent ? (
                  <span className="tag tag-success h-11 w-full justify-center !text-[13px]">
                    <Check className="h-4 w-4" /> {s.sent}
                  </span>
                ) : sending ? (
                  <span className="btn-primary h-11 w-full justify-center !text-[13px] opacity-75">
                    <RefreshCcw className="h-4 w-4 animate-spin" /> {s.sending}
                  </span>
                ) : (
                  <span
                    className={`btn-primary h-11 w-full justify-center !text-[13px] transition-opacity duration-500 ${
                      ready ? "opacity-100" : "pointer-events-none opacity-30"
                    }`}
                  >
                    <Send className="h-4 w-4" /> {s.confirm}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </TiltOnScroll>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section                                                           */
/* ------------------------------------------------------------------ */
export function ExtensionSection({ locale }: { locale: Locale }) {
  const c = copy[locale];
  const downloadHref = locale === "en" ? `${DOWNLOAD_HREF}?ui_locale=en` : DOWNLOAD_HREF;

  return (
    <section id="extension" className="relative overflow-hidden border-t border-hairline bg-[#0b0d0e]">
      {/* faint gold horizon, echoing the final CTA */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-[12%] top-0 h-px bg-gradient-to-r from-transparent via-brand/30 to-transparent"
      />
      <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="eyebrow-mono">{c.eyebrow}</p>
          <h2 className="mt-3 text-pretty text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-5xl">
            {c.title}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-fg-muted">{c.sub}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="tag tag-brand">{c.pilotTag}</span>
            <span className="tag tag-neutral">{c.versionTag}</span>
          </div>
        </Reveal>

        <Reveal delay={0.12} className="mt-8 flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <TrackedCtaLink
              href={downloadHref}
              sourceType="landing"
              sourceSlug="extension-section"
              sourceSurface="landing"
              destination="extension_download"
              locale={locale}
              className="btn-primary h-11 px-6 text-[15px]"
            >
              <PanelRight className="h-4 w-4" />
              {c.cta}
            </TrackedCtaLink>
            <span className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface/50 px-4 py-2.5 text-xs text-fg-muted">
              <Download className="h-3.5 w-3.5 text-brand" />
              {c.freeNote}
            </span>
          </div>
        </Reveal>

        <div className="mt-14">
          <ExtensionStage locale={locale} />
        </div>

        <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" gap={0.09} amount={0.25}>
          {c.capabilities.map((cap) => (
            <StaggerItem key={cap.title}>
              <div className="group h-full rounded-2xl border border-hairline bg-surface/40 p-5 transition-colors duration-300 hover:border-brand/40">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/12 text-brand">
                  <cap.icon className="h-4.5 w-4.5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-fg">{cap.title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-fg-muted">{cap.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-10">
          <p className="flex flex-wrap items-center justify-center gap-2 text-center font-mono text-[11px] tracking-wide text-fg-muted/80">
            <ShieldCheck className="h-3.5 w-3.5 text-brand/80" />
            {c.trustLine}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
