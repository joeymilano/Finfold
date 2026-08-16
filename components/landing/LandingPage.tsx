"use client";

import Link from "next/link";
import NextImage from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import {
  Activity,
  ArrowRight,
  Check,
  ClipboardPaste,
  Database,
  Image as ImageIcon,
  PlugZap,
  RefreshCcw,
  Rocket,
  Star
} from "@/components/ui/icons";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { MarketingResourceLink } from "@/components/marketing/MarketingResourceLink";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";
import { HeroMockup } from "@/components/landing/hero-mockup";
import { ShaderBackdrop } from "@/components/landing/shader-backdrop";
import { BrandLottie } from "@/components/visual/brand-lottie";
import {
  AgentVisual,
  BrandMemoryVisual,
  PlatformRulesVisual
} from "@/components/landing/feature-visuals";
import {
  BlurText,
  CountUp,
  CycleText,
  EASE,
  Reveal,
  ScoreTicker,
  ScrollHighlightText,
  Spotlight,
  Stagger,
  StaggerItem,
  useHydratedReducedMotion
} from "@/components/landing/motion-primitives";
import { FadingVideo } from "@/components/landing/fading-video";
import { brand } from "@/lib/brand";
import {
  PLAN_SCENARIOS,
  PRICING_PLAN_ORDER,
  PRICING_PLANS,
  formatPlanPrice,
  getLocalizedPlanCopy,
  marketForLocale
} from "@/lib/pricing";
import { platforms, type PlatformId } from "@/lib/platforms";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import { getStoredLocale } from "@/lib/theme";
import type { Locale } from "@/lib/i18n";
import { captureEvent } from "@/lib/posthog";
import { toolPages } from "@/lib/tool-pages";
import { getLandingFeaturedBlogPosts } from "@/lib/blog-posts";
import { useCasePages } from "@/lib/use-case-pages";

const landingFeaturedBlogPosts = getLandingFeaturedBlogPosts();

/** First-screen entrance — fires on mount (elements are already in view). */
function FadeOnMount({
  children,
  className,
  delay = 0,
  y = 16
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Copy — bilingual, organized by section                            */
/* ------------------------------------------------------------------ */
const copy = {
  zh: {
    hero: {
      kicker: "你的第一位 AI 营销员工",
      titleA: "为小团队发现并准备",
      titleEm: "下一次增长机会的 AI 营销智能体",
      titleB: "",
      sub: "贴上你的网站，Finfold 找出值得做的增长机会，准备可审核的任务，并把真实结果带回下一轮",
      primaryCta: "免费获取增长机会",
      secondaryCta: "使用免费创作工具",
      githubTrust: "支持 Agents 和 GitHub"
    },
    visualSystem: {
      eyebrow: "AI 营销智能体的一项能力",
      title: "内容复用不是定位 是一项具体工作",
      sub: "Finfold 可以把一条真实信号改成不同平台的内容；它也会先发现机会、准备任务，并等待你审核",
      images: [
        {
          title: "一次输入 文案和图片一起准备好",
          body: "把一条更新变成不同平台能直接用的内容"
        },
        {
          title: "发出去以后 效果也能记下来",
          body: "不用再到处找表格和链接"
        },
        {
          title: "用得越久 越懂你的品牌",
          body: "你的语气、习惯和修改会被记住"
        }
      ]
    },
    stats: [
      { value: "14", label: "个平台" },
      { value: "9", label: "种图片尺寸" },
      { value: "90s", label: "看到初稿" },
      { value: "50", label: "免费创作点数" }
    ],
    comparison: {
      eyebrow: "Claude 和 ChatGPT 会写 Finfold 帮你把事情做完",
      title: "从一段文字到真正能发出去的内容",
      sub: "如果你只想写一段文字，用 Claude 或 ChatGPT 就够了；Finfold 还会帮你做图片、整理尺寸、记录发布结果，并继续帮你改",
      diyTitle: "Claude / ChatGPT",
      finfoldTitle: "Agents + Finfold",
      rows: [
        { label: "开始写", diy: "每次都要重新说明产品和语气", finfold: "品牌资料存好，之后直接用" },
        { label: "要发的内容", diy: "主要是文字，图片和尺寸要自己处理", finfold: "文案、封面、配图和尺寸一次准备好" },
        { label: "发出去以后", diy: "结果散在各个平台和表格里", finfold: "链接、数据和下一步建议放在一起" },
        { label: "长期使用", diy: "要自己维护提示词和 Skills", finfold: "你的修改和数据会让下一次更贴近你" }
      ]
    },
    features: [
      {
        eyebrow: "你的品牌",
        title: "告诉它一次 以后都按你的方式写",
        body: "把品牌名、受众、语气和不想出现的词告诉 Finfold",
        bullets: ["语气和受众保存一次", "可以放你喜欢的范文", "每次生成前都会检查"]
      },
      {
        eyebrow: "不同平台 不同写法",
        title: "小红书 公众号 X 各有各的写法",
        body: "Finfold 会按平台整理文字、图片和尺寸，减少你来回修改",
        bullets: ["不同平台分别处理", "封面和配图一起做", "支持 3:4、9:16、1:1 等常用尺寸"]
      },
      {
        eyebrow: "AI 内容增长专家",
        title: "不只写 还能帮你安排接下来发什么",
        body: "它可以根据你的更新准备内容，帮你安排发布计划，并总结哪些内容更有效",
        bullets: ["有更新就能准备稿子", "帮你安排发布顺序", "给你一份简单的月度总结"]
      }
    ],
    platformsTitle: "同一条更新 发到不同平台",
    platformsSub: "你提供内容，Finfold 帮你改成每个平台适合的样子",
    flowTitle: "从一条更新到发出去 四步就够",
    flow: [
      { icon: ClipboardPaste, title: "把更新发给 Finfold", body: "产品更新、用户反馈、文章或一个想法都可以" },
      { icon: ImageIcon, title: "选平台 生成文案和图片", body: "一次生成不同平台的内容和尺寸" },
      { icon: Rocket, title: "检查 修改 发出去", body: "不满意的地方可以直接改，整理好后导出" },
      { icon: RefreshCcw, title: "看看效果 下次继续变好", body: "记录数据，知道哪些内容值得继续" }
    ],
    pricingTitle: "从免费试用开始",
    pricingSub: "先用免费版跑通完整流程，需要更多创作点数、更强增长能力或持续自动化时再升级",
    pricingCta: "开始使用",
    pricingMostPopular: "最多人选",
    finalCtaTitle: "有产品 就要让更多人知道",
    finalCtaSub: "免费试用 Finfold，把下一条产品更新变成可以直接发布的内容",
    finalCtaButton: "免费试用",
    finalCtaNote: "免费注册 · 数据全程加密"
  },
  en: {
    hero: {
      kicker: "YOUR FIRST AI MARKETING EMPLOYEE",
      titleA: "An AI marketing agent",
      titleEm: "that finds and prepares your next growth opportunity.",
      titleB: "",
      sub: "Share your website. Finfold finds an opportunity worth acting on, prepares a reviewable mission, and brings real outcomes into the next round.",
      primaryCta: "Find my growth opportunity",
      secondaryCta: "Use free creation tools",
      githubTrust: "Works with Agents & GitHub"
    },
    visualSystem: {
      eyebrow: "ONE CAPABILITY OF THE MARKETING AGENT",
      title: "Content repurposing is a job, not the whole category",
      sub: "Finfold can adapt one real signal for different channels — after it finds an opportunity, prepares the mission, and waits for your review",
      images: [
        {
          title: "One input, copy and visuals ready together",
          body: "Turn one update into content you can use on different platforms"
        },
        {
          title: "Keep track of what happens after you post",
          body: "No more hunting through spreadsheets and links"
        },
        {
          title: "The longer you use it, the more it sounds like you",
          body: "Your voice, habits, and edits are remembered"
        }
      ]
    },
    stats: [
      { value: "14", label: "platforms" },
      { value: "9", label: "visual formats" },
      { value: "90s", label: "to see a draft" },
      { value: "50", label: "free AI Credits" }
    ],
    comparison: {
      eyebrow: "CLAUDE AND CHATGPT CAN WRITE — FINFOLD HELPS YOU FINISH THE JOB",
      title: "From a draft to content you can actually post",
      sub: "If you only need a paragraph, Claude or ChatGPT may be enough — Finfold also handles visuals, platform sizes, publishing notes, and what to improve next",
      diyTitle: "Claude / ChatGPT",
      finfoldTitle: "Agents + Finfold",
      rows: [
        { label: "Start writing", diy: "Explain the product and voice again each time", finfold: "Save your brand details once and reuse them" },
        { label: "What you post", diy: "Mostly text; visuals and sizes are up to you", finfold: "Copy, covers, visuals, and sizes ready together" },
        { label: "After posting", diy: "Results are scattered across channels and sheets", finfold: "Links, results, and next steps stay together" },
        { label: "Over time", diy: "Maintain prompts and Skills yourself", finfold: "Your edits and results make the next draft better" }
      ]
    },
    features: [
      {
        eyebrow: "Your brand",
        title: "Tell it once and keep writing in your voice",
        body: "Give Finfold your brand, audience, voice, and words to avoid",
        bullets: ["Save your voice and audience once", "Add examples you like", "Check every draft before it goes out"]
      },
      {
        eyebrow: "Different platforms, different formats",
        title: "Xiaohongshu, WeChat, X — each has its own style",
        body: "Finfold adapts the copy, visuals, and canvas for each platform so you spend less time resizing and rewriting",
        bullets: ["Platform-specific writing guidance", "Covers and visuals made together", "Common 3:4, 9:16, and 1:1 formats"]
      },
      {
        eyebrow: "Your AI content growth expert",
        title: "Plan what to post next too",
        body: "Finfold can turn your updates into a simple publishing plan and show you which posts are working",
        bullets: ["Draft when you have an update", "Plan the order of your posts", "Get a simple monthly recap"]
      }
    ],
    platformsTitle: "One update, ready for every platform",
    platformsSub: "Bring the idea — Finfold adapts it to the way each platform works",
    flowTitle: "From one update to a published post in four steps",
    flow: [
      { icon: ClipboardPaste, title: "Send Finfold your update", body: "A product update, customer note, article, or rough idea is enough" },
      { icon: ImageIcon, title: "Pick platforms and generate", body: "Get copy, visuals, and the right sizes in one go" },
      { icon: Rocket, title: "Check, edit, and post", body: "Make quick changes, then export what is ready to publish" },
      { icon: RefreshCcw, title: "See what worked next time", body: "Keep the results so the next post gets easier and better" }
    ],
    pricingTitle: "Start free",
    pricingSub: "Complete the workflow for free — upgrade for more AI Credits, stronger growth capabilities, or continuous automation",
    pricingCta: "Get started",
    pricingMostPopular: "Most popular",
    finalCtaTitle: "You built something worth talking about",
    finalCtaSub: "Try Finfold free and turn your next product update into content you can publish",
    finalCtaButton: "Try it free",
    finalCtaNote: "Free signup · End-to-end encrypted"
  }
} as const;

const APP_ENTRY_HREF = "/workbench";
const GROWTH_AUDIT_ENTRY_HREF = "/signup?next=%2Fdashboard";

/* ------------------------------------------------------------------ */
/*  Hero atmosphere video — a slow ambient loop blended into the      */
/*  ShaderBackdrop via screen blending at low opacity. Self-hosted:   */
/*  4K/5.5MB source compressed to 1280w, ~0.2MB, faststart.           */
/* ------------------------------------------------------------------ */
const HERO_ATMOSPHERE_VIDEO_ENABLED = true;
const HERO_ATMOSPHERE_VIDEO_URL = "/media/hero-atmosphere.mp4";

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */
export function LandingPage({
  initialLocale,
  localeHref
}: {
  initialLocale?: Locale;
  localeHref?: string;
} = {}) {
  const [locale, setLocale] = useState<Locale>(initialLocale ?? "zh");
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const pricingRef = useRef<HTMLElement>(null);
  const pricingTracked = useRef(false);
  const reduceMotion = useHydratedReducedMotion();
  // Flipped when the emphasis headline's blur-in completes (or upfront
  // for reduced-motion users) — swaps per-character ink for the
  // continuous whole-line gradient in `.hero-em-done`.
  const [emDone, setEmDone] = useState(false);

  // Depth: as the hero leaves the viewport its content lifts gently and
  // dims, handing the stage to the mockup below — like a camera pull-back.
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });
  const heroLift = useTransform(heroProgress, [0, 1], [0, -64]);
  const heroDim = useTransform(heroProgress, [0, 0.75], [1, 0.25]);

  // The landing page is dark-only: force the dark theme while mounted and
  // restore the visitor's own theme when they navigate back into the app.
  // localStorage is never touched, so their saved preference survives.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "dark");
    return () => {
      if (previous === "light" || previous === "dark") {
        root.setAttribute("data-theme", previous);
      }
    };
  }, []);

  useEffect(() => {
    if (!initialLocale) {
      setLocale(getStoredLocale());
    }
    captureEvent("landing_view", {
      contentType: "landing",
      locale: initialLocale ?? getStoredLocale(),
      path: window.location.pathname
    });
    function onLocaleChange(e: Event) {
      if (!initialLocale) {
        setLocale((e as CustomEvent<Locale>).detail);
      }
    }
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    window.addEventListener("finfold-locale-change", onLocaleChange);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("finfold-locale-change", onLocaleChange);
      window.removeEventListener("scroll", onScroll);
    };
  }, [initialLocale]);

  useEffect(() => {
    const node = pricingRef.current;
    if (!node || pricingTracked.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || pricingTracked.current) return;
        pricingTracked.current = true;
        captureEvent("pricing_viewed", {
          locale,
          market: marketForLocale(locale),
          currency: locale === "en" ? "USD" : "CNY",
          billing_period: "monthly",
          source_page: "landing",
          is_existing_user: false
        });
        observer.disconnect();
      },
      { threshold: 0.25 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [locale]);

  const c = copy[locale];

  return (
    <>
      <main className="relative min-h-screen overflow-hidden bg-bg text-fg">
        {/* Film grain — the analog layer that makes the whole page feel printed, not rendered */}
        <div className="grain" aria-hidden />
        {/* ---------- Nav ---------- */}
        <PublicSiteHeader locale={locale} localeHref={localeHref} sticky scrolled={scrolled} />

        {/* ---------- Hero ---------- */}
        <section ref={heroRef} className="hero-stage relative overflow-hidden">
          {/* The live backdrop: a slow WebGL gradient field, layered under a
              faint engineering grid so the scene keeps its structure. */}
          <div className="hero-aurora pointer-events-none" aria-hidden />
          <ShaderBackdrop />
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="hero-grid absolute inset-0 opacity-50" />
          </div>
          {/* Atmospheric motion layer — the hero's wow moment: a slow
              ambient loop screen-blended over the shader field at high
              presence. Framing centers on the moss/bubble band of the
              source footage (object-position 42%); the gradient mask
              dissolves it before the product mockup so text and UI stay
              crisp. CSS hides the layer for reduced-motion users while
              keeping the server and first client render identical. */}
          {HERO_ATMOSPHERE_VIDEO_ENABLED ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[64%] overflow-hidden opacity-[0.92] mix-blend-screen motion-reduce:hidden"
              style={{
                WebkitMaskImage:
                  "linear-gradient(to bottom, black 55%, transparent 96%)",
                maskImage:
                  "linear-gradient(to bottom, black 55%, transparent 96%)"
              }}
            >
              <FadingVideo src={HERO_ATMOSPHERE_VIDEO_URL} className="h-full w-full object-cover" style={{ objectPosition: "center 50%" }} />
            </div>
          ) : null}
          <Spotlight />

          <motion.div
            style={{ y: heroLift, opacity: heroDim }}
            className="relative z-10 mx-auto max-w-6xl px-5 pb-5 pt-16 text-center sm:pt-24"
          >
            <FadeOnMount delay={0.05}>
              <p className="eyebrow-mono liquid-glass mx-auto inline-flex items-center gap-2 rounded-full px-3 py-2">
                <span className="status-dot" />
                {c.hero.kicker}
              </p>
            </FadeOnMount>
            <h1 className={`hero-title mx-auto mt-6 max-w-6xl leading-[1.04] tracking-[-0.035em] text-fg ${locale === "zh" ? "font-display-zh" : "font-display"}`}>
              <BlurText
                text={c.hero.titleA}
                mode="mount"
                delay={0.14}
                className="block text-[clamp(2.25rem,4.6vw,4.75rem)]"
              />
              <BlurText
                text={c.hero.titleEm}
                mode="mount"
                delay={0.36}
                className={`mt-2 block text-[clamp(2.25rem,4.6vw,4.75rem)] ${locale === "en" ? "italic" : ""} ${
                  emDone || reduceMotion ? "hero-em-done" : ""
                }`}
                wordClassName="hero-title-em"
                onComplete={() => setEmDone(true)}
              />
            </h1>
            {locale === "zh" ? (
              <FadeOnMount delay={0.6}>
                <p className="brand-cn mt-5 text-sm font-medium tracking-[0.32em] text-brand">
                  {brand.chineseName} · 一次创作 处处增长
                </p>
              </FadeOnMount>
            ) : null}
            <FadeOnMount delay={0.5}>
              <p className="mx-auto mt-6 max-w-5xl text-pretty text-base leading-7 text-fg-muted sm:text-lg sm:leading-8 lg:whitespace-nowrap">
                {c.hero.sub}
              </p>
            </FadeOnMount>
            <FadeOnMount delay={0.64}>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <motion.span whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} className="w-full sm:w-auto">
                  <Link
                    href={GROWTH_AUDIT_ENTRY_HREF}
                    onClick={() => captureEvent("growth_audit_entry_clicked", { locale, source_page: "landing_hero" })}
                    className="btn-primary focus-ring w-full px-6 py-3 text-sm sm:w-auto"
                  >
                    {c.hero.primaryCta} <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.span>
                <motion.span whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} className="w-full sm:w-auto">
                  <Link href={`${locale === "en" ? "/en" : ""}/tools`} className="liquid-glass-strong focus-ring inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-fg sm:w-auto">
                    {c.hero.secondaryCta}
                  </Link>
                </motion.span>
              </div>
            </FadeOnMount>
            <FadeOnMount delay={0.78}>
              <div
                className="liquid-glass mx-auto mt-6 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-fg-muted"
                role="img"
                aria-label="Built for Agents and GitHub"
              >
                <GitHubMark className="h-4 w-4 text-fg/80" />
                <span>{c.hero.githubTrust}</span>
                <span className="h-1 w-1 rounded-full bg-fg-muted/50" aria-hidden="true" />
                <span className="text-fg-muted/80">Finfold</span>
              </div>
            </FadeOnMount>
          </motion.div>

          {/* Hero product mockup */}
          <FadeOnMount delay={0.9} y={26} className="relative mx-auto mt-10 max-w-6xl px-5 pb-0">
            <HeroMockup />
          </FadeOnMount>
        </section>

        {/* ---------- The Reel — content being produced, live ---------- */}
        <section className="relative border-t border-hairline bg-bg">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
            <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
              {/* Sticky editorial column */}
              <div className="lg:sticky lg:top-28">
                <Reveal>
                  <p className="eyebrow-mono">{c.visualSystem.eyebrow}</p>
                  <h2 className="text-pretty mt-3 text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-5xl">
                    {c.visualSystem.title}
                  </h2>
                  <p className="mt-4 max-w-xl text-base leading-7 text-fg-muted">
                    {c.visualSystem.sub}
                  </p>
                </Reveal>
                <Stagger className="mt-9 space-y-5" gap={0.14}>
                  {c.visualSystem.images.map((asset) => (
                    <StaggerItem key={asset.title} y={18}>
                      <div className="flex items-start gap-3.5">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/12 text-brand">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-fg">{asset.title}</p>
                          <p className="mt-1 text-[12.5px] leading-5 text-fg-muted">{asset.body}</p>
                        </div>
                      </div>
                    </StaggerItem>
                  ))}
                </Stagger>
                <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <MarketingResourceLink
                    href={`${locale === "en" ? "/en" : ""}/use-cases/ai-marketing-for-small-business`}
                    resourceType="use_case"
                    slug="ai-marketing-for-small-business"
                    surface="landing"
                    locale={locale}
                    className="panel panel-hover focus-ring group rounded-xl p-4"
                  >
                    <span className="eyebrow-mono text-brand">{locale === "en" ? "SMALL BUSINESS" : "小企业 AI 营销"}</span>
                    <span className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-fg">
                      {locale === "en" ? "See the reviewable agent workflow" : "查看可审核的智能体工作流"}
                      <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
                    </span>
                  </MarketingResourceLink>
                  <MarketingResourceLink
                    href={`${locale === "en" ? "/en" : ""}/use-cases/content-repurposing-for-solopreneurs`}
                    resourceType="use_case"
                    slug="content-repurposing-for-solopreneurs"
                    surface="landing"
                    locale={locale}
                    className="panel panel-hover focus-ring group rounded-xl p-4"
                  >
                    <span className="eyebrow-mono text-brand">{locale === "en" ? "CONTENT REPURPOSING" : "内容复用"}</span>
                    <span className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-fg">
                      {locale === "en" ? "Open the dedicated workflow" : "进入专属内容复用工作流"}
                      <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
                    </span>
                  </MarketingResourceLink>
                </div>
              </div>

              {/* The live wall — two counter-scrolling columns of drafts,
                  framed like a film reel that never stops running. */}
              <Reveal delay={0.12} y={36}>
                <div className="panel relative overflow-hidden !rounded-[1.35rem] shadow-raised">
                  <div className="reel-sprockets" aria-hidden />
                  <div className="grid grid-cols-2 gap-3 px-3.5 py-3.5 sm:px-4">
                    <ReelColumn cards={REEL_CARDS.slice(0, 4)} locale={locale} />
                    <ReelColumn cards={REEL_CARDS.slice(4)} locale={locale} reverse offset={4} />
                  </div>
                  <div className="reel-sprockets" aria-hidden />
                  <div className="flex items-center justify-between border-t border-hairline bg-surface-2/50 px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 text-[11px] font-medium text-fg-muted">
                      <span className="status-dot" />
                      <CycleText
                        words={
                          locale === "zh"
                            ? ["正在生成小红书初稿", "正在排版公众号封面", "正在为 X 调整语气", "正在给知乎回答评分"]
                            : ["Drafting for RED", "Laying out the WeChat cover", "Tuning the tone for X", "Scoring a Zhihu answer"]
                        }
                        intervalMs={2600}
                      />
                    </span>
                    <span className="tabular hidden text-[11px] text-fg-muted sm:inline">
                      {locale === "zh" ? "14 个平台可用" : "14 platforms available"}
                    </span>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---------- Stats band — ruled ledger of numbers ---------- */}
        <section className="border-y border-hairline bg-surface/40">
          <Stagger
            className="mx-auto grid max-w-5xl grid-cols-2 gap-px bg-hairline/50 px-0 sm:grid-cols-4"
            gap={0.12}
            amount={0.5}
          >
            {c.stats.map((s) => (
              <StaggerItem key={s.label} y={18} className="bg-bg">
                <div className="group px-4 py-9 text-center sm:py-11">
                  <p className="font-display tabular text-3xl tracking-tight text-fg transition-colors duration-300 group-hover:text-brand sm:text-[3.4rem]">
                    <CountUp value={s.value} />
                  </p>
                  <p className="eyebrow-mono mt-1.5 text-fg-muted">{s.label}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* ---------- Free tools — low-friction acquisition ---------- */}
        <section id="free-tools" className="relative border-b border-hairline bg-bg">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
            <Reveal className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow-mono">{locale === "en" ? "START WITH ONE REAL JOB" : "先解决一个真实任务"}</p>
                <h2 className="mt-3 max-w-3xl text-pretty text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-5xl">
                  {locale === "en" ? "Free tools for the platform you need today" : "今天先把一个平台的内容做出来"}
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-fg-muted">
                  {locale === "en"
                    ? "Every generator uses Finfold's real platform rules. No prompt engineering, no generic cross-posting."
                    : "每个生成器都使用 Finfold 的真实平台规则 不用调 prompt 也不是把同一段话复制到所有平台"}
                </p>
              </div>
              <MarketingResourceLink
                href={`${locale === "en" ? "/en" : ""}/tools`}
                resourceType="tool"
                slug="tools-index"
                surface="landing"
                locale={locale}
                className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-lg text-sm font-semibold text-brand hover:underline"
              >
                {locale === "en" ? "See all free tools" : "查看全部免费工具"} <ArrowRight className="h-4 w-4" />
              </MarketingResourceLink>
            </Reveal>

            <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" gap={0.08} amount={0.2}>
              {toolPages.map((tool, index) => (
                <StaggerItem key={tool.slug}>
                  <MarketingResourceLink
                    href={`${locale === "en" ? "/en" : ""}/tools/${tool.slug}`}
                    resourceType="tool"
                    slug={tool.slug}
                    surface="landing"
                    locale={locale}
                    className="panel panel-hover group relative flex h-full min-h-56 flex-col overflow-hidden rounded-2xl p-6"
                  >
                    <span className="absolute right-4 top-3 font-display text-5xl font-semibold text-brand/[0.08]">0{index + 1}</span>
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/12 text-brand">
                      <PlatformGlyph platform={tool.platform} className="h-5 w-5" />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold leading-tight text-fg">{locale === "en" ? tool.titleEn : tool.titleZh}</h3>
                    <p className="mt-3 flex-1 text-sm leading-6 text-fg-muted">{locale === "en" ? tool.descriptionEn : tool.descriptionZh}</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-fg transition-colors group-hover:text-brand">
                      {locale === "en" ? "Use for free" : "免费使用"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </MarketingResourceLink>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ---------- Claude / ChatGPT / Agents comparison ---------- */}
        <section id="compare" className="relative border-b border-hairline bg-bg">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
            <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
              <Reveal>
                <p className="eyebrow-mono">{c.comparison.eyebrow}</p>
                <h2 className="text-pretty mt-3 text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-5xl">
                  {c.comparison.title}
                </h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-fg-muted">{c.comparison.sub}</p>
                <Link
                  href="/for-agents"
                  className="focus-ring mt-6 inline-flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-4 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand/15"
                >
                  <PlugZap className="h-4 w-4" />
                  {locale === "en" ? "Connect your existing agent" : "让现有 Agent 直接接入 Finfold"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Reveal>

              <Reveal delay={0.12}>
                <div className="overflow-hidden rounded-[1.5rem] border border-hairline bg-surface/70 shadow-raised">
                  <div className="grid grid-cols-[0.72fr_1fr_1fr] border-b border-hairline bg-surface-2/60 text-[11px] font-semibold uppercase tracking-wider text-fg-muted sm:grid-cols-[0.58fr_1fr_1fr] sm:text-xs">
                    <div className="px-3 py-4 sm:px-5" />
                    <div className="border-l border-hairline px-3 py-4 sm:px-5">{c.comparison.diyTitle}</div>
                    <div className="border-l border-brand/25 bg-brand/[0.08] px-3 py-4 text-brand sm:px-5">{c.comparison.finfoldTitle}</div>
                  </div>
                  <Stagger gap={0.11} amount={0.3}>
                    {c.comparison.rows.map((row, index) => {
                      const RowIcon = [Activity, ImageIcon, Database, PlugZap][index];
                      return (
                        <StaggerItem
                          key={row.label}
                          y={22}
                          className="grid grid-cols-[0.72fr_1fr_1fr] border-b border-hairline last:border-b-0 sm:grid-cols-[0.58fr_1fr_1fr]"
                        >
                          <div className="flex flex-col gap-2 px-3 py-4 sm:flex-row sm:items-center sm:px-5 sm:py-5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-fg-muted">
                              <RowIcon className="h-4 w-4" />
                            </span>
                            <span className="text-xs font-semibold text-fg sm:text-sm">{row.label}</span>
                          </div>
                          <div className="border-l border-hairline px-3 py-4 text-xs leading-5 text-fg-muted sm:px-5 sm:py-5 sm:text-sm sm:leading-6">
                            {row.diy}
                          </div>
                          <div className="border-l border-brand/25 bg-brand/[0.055] px-3 py-4 text-xs font-medium leading-5 text-fg sm:px-5 sm:py-5 sm:text-sm sm:leading-6">
                            <span className="mb-2 flex h-5 w-5 items-center justify-center rounded-full bg-positive/15 text-positive">
                              <Check className="h-3.5 w-3.5" />
                            </span>
                            {row.finfold}
                          </div>
                        </StaggerItem>
                      );
                    })}
                  </Stagger>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---------- Feature deep dives (alternating) ---------- */}
        <section id="product" className="relative">
          {c.features.map((f, i) => {
            const Visual = [BrandMemoryVisual, PlatformRulesVisual, AgentVisual][i];
            const flip = i % 2 === 1;
            return (
              <div
                key={f.title}
                className="mx-auto max-w-6xl border-t border-hairline px-5 py-14 sm:py-20"
              >
                <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                  <Reveal className={flip ? "lg:order-2" : ""}>
                    <p className="eyebrow-mono">{f.eyebrow}</p>
                    <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-fg sm:text-3xl">{f.title}</h3>
                    <p className="mt-4 text-base leading-7 text-fg-muted">{f.body}</p>
                    <ul className="mt-6 space-y-2.5">
                      {f.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2.5 text-sm text-fg">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-positive/15 text-positive">
                            <Check className="h-3 w-3" />
                          </span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  </Reveal>
                  <Reveal delay={0.14} className={flip ? "lg:order-1" : ""}>
                    <Visual />
                  </Reveal>
                </div>
              </div>
            );
          })}
        </section>

        {/* ---------- Use cases — three composite, human stories ---------- */}
        <section className="border-t border-hairline bg-surface/30">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
            <Reveal className="mx-auto max-w-3xl text-center">
              <p className="eyebrow-mono">{locale === "en" ? "NOT PERSONAS — REAL MOMENTS" : "不是用户画像 是他们真实的一天"}</p>
              <h2 className="mt-3 text-pretty text-3xl font-semibold tracking-tight text-fg sm:text-5xl">
                {locale === "en" ? "Three moments when content follows people home" : "三种人 三个被内容追着跑的时刻"}
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-fg-muted">
                {locale === "en"
                  ? "A blank launch post after midnight, an essay waiting to become four different stories, and one product being pulled apart by two markets."
                  : "凌晨上线后还空着的发布稿、一篇等着改成四种讲法的长文、还有快被两个市场写成两件东西的新品"}
              </p>
            </Reveal>
            <Stagger className="mt-12 grid gap-5 lg:grid-cols-3" gap={0.1} amount={0.2}>
              {useCasePages.map((useCase, index) => (
                <StaggerItem key={useCase.slug}>
                  <MarketingResourceLink
                    href={`${locale === "en" ? "/en" : ""}/use-cases/${useCase.slug}`}
                    resourceType="use_case"
                    slug={useCase.slug}
                    surface="landing"
                    locale={locale}
                    className="panel panel-hover group flex h-full flex-col overflow-hidden rounded-2xl"
                  >
                    <span className="relative block aspect-[16/10] overflow-hidden border-b border-hairline bg-bg-inset">
                      <NextImage
                        src={useCase.image}
                        alt={locale === "en" ? useCase.imageAltEn : useCase.imageAltZh}
                        fill
                        sizes="(min-width: 1024px) 33vw, 100vw"
                        className="object-cover transition duration-500 group-hover:scale-[1.025]"
                      />
                      <span className="absolute left-4 top-4 bg-bg/90 px-2.5 py-1 font-mono text-[11px] text-brand backdrop-blur">
                        0{index + 1}
                      </span>
                    </span>
                    <span className="flex flex-1 flex-col p-6 sm:p-7">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
                        {locale === "en" ? useCase.eyebrowEn : useCase.eyebrowZh}
                      </span>
                      <span className="mt-3 block text-xl font-semibold leading-snug text-fg">
                        {locale === "en" ? useCase.titleEn : useCase.titleZh}
                      </span>
                      <span className="mt-3 flex-1 text-sm leading-7 text-fg-muted">
                        {locale === "en" ? useCase.descriptionEn : useCase.descriptionZh}
                      </span>
                      <span className="mt-5 block border-l-2 border-brand/60 pl-3 text-sm italic leading-6 text-fg/80">
                        {locale === "en" ? useCase.quoteEn : useCase.quoteZh}
                      </span>
                      <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-fg transition-colors group-hover:text-brand">
                        {locale === "en" ? "Walk through this day" : "走进这一天"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </span>
                    </span>
                  </MarketingResourceLink>
                </StaggerItem>
              ))}
            </Stagger>
            <Reveal className="mt-8 text-center">
              <MarketingResourceLink
                href={`${locale === "en" ? "/en" : ""}/use-cases`}
                resourceType="use_case"
                slug="use-cases-index"
                surface="landing"
                locale={locale}
                className="focus-ring inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-brand hover:underline"
              >
                {locale === "en" ? "Explore all use cases" : "查看全部使用场景"} <ArrowRight className="h-4 w-4" />
              </MarketingResourceLink>
            </Reveal>
          </div>
        </section>

        {/* ---------- Platform spiral — one idea, every platform in its flow ---------- */}
        <section className="overflow-hidden border-t border-hairline bg-surface/30">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:py-28 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <Reveal>
                <h2 className="text-pretty text-2xl font-semibold leading-tight tracking-tight text-fg sm:text-4xl">
                  {c.platformsTitle}
                </h2>
                <p className="mt-3 max-w-md text-base leading-7 text-fg-muted">{c.platformsSub}</p>
              </Reveal>
              <Stagger className="mt-8 space-y-4" gap={0.13}>
                {(locale === "zh"
                  ? [
                      "14 个平台 持续增加",
                      "每个平台的尺寸 语气 标签自动适配",
                      "中文与海外平台 共用同一套品牌记忆"
                    ]
                  : [
                      "14 platforms and growing",
                      "Sizes, tone, and tags adapted per platform",
                      "One brand memory across CN and global"
                    ]
                ).map((line) => (
                  <StaggerItem key={line} y={16}>
                    <p className="flex items-center gap-3 text-sm text-fg">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/12 text-brand">
                        <Check className="h-3 w-3" />
                      </span>
                      {line}
                    </p>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
            <Reveal delay={0.15} y={30}>
              <PlatformOrbit locale={locale} />
            </Reveal>
          </div>
        </section>

        {/* ---------- Flow ---------- */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-4xl">{c.flowTitle}</h2>
          </Reveal>
          <div className="relative mt-12">
            {/* The thread that stitches the four steps together (desktop) */}
            <motion.div
              aria-hidden
              className="flow-thread absolute -top-3 left-[8%] right-[8%] hidden h-px origin-left lg:block"
              initial={{ scaleX: 0, opacity: 0 }}
              whileInView={{ scaleX: 1, opacity: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 1.4, ease: EASE }}
            />
            <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" gap={0.14} amount={0.3}>
              {c.flow.map((step, i) => (
                <StaggerItem key={step.title}>
                  <div className="lift group relative h-full rounded-2xl border border-hairline bg-surface/60 p-6">
                    <span className="text-5xl font-semibold tabular text-brand/25 transition-colors duration-300 group-hover:text-brand/70">
                      0{i + 1}
                    </span>
                    <span className="absolute right-5 top-6 flex h-9 w-9 items-center justify-center rounded-lg bg-brand/12 text-brand">
                      <step.icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold text-fg">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-fg-muted">{step.body}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ---------- Playbooks — authority and organic discovery ---------- */}
        <section className="border-y border-hairline bg-surface/30">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
            <Reveal className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow-mono">{locale === "en" ? "GROWTH FIELD NOTES" : "增长博客 · 现场笔记"}</p>
                <h2 className="mt-3 text-pretty text-3xl font-semibold tracking-tight text-fg sm:text-5xl">
                  <ScrollHighlightText
                    text={locale === "en" ? "Know why a draft fits the channel" : "不只拿到草稿 也知道为什么这样写"}
                  />
                </h2>
              </div>
              <MarketingResourceLink
                href={`${locale === "en" ? "/en" : ""}/blog`}
                resourceType="blog"
                slug="blog-index"
                surface="landing"
                locale={locale}
                className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-lg text-sm font-semibold text-brand hover:underline"
              >
                {locale === "en" ? "Read the growth blog" : "去增长博客坐坐"} <ArrowRight className="h-4 w-4" />
              </MarketingResourceLink>
            </Reveal>
            <Stagger className="mt-12 grid gap-5 lg:grid-cols-3" gap={0.1} amount={0.2}>
              {landingFeaturedBlogPosts.map((post) => (
                <StaggerItem key={post.slug}>
                  <MarketingResourceLink
                    href={`${locale === "en" ? "/en" : ""}/blog/${post.slug}`}
                    resourceType="blog"
                    slug={post.slug}
                    surface="landing"
                    locale={locale}
                    className="panel panel-hover group flex h-full flex-col rounded-2xl p-6"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">{post.platform}</p>
                    <h3 className="mt-3 text-xl font-semibold leading-tight text-fg">{locale === "en" ? post.titleEn : post.titleZh}</h3>
                    <p className="mt-3 flex-1 text-sm leading-6 text-fg-muted">{locale === "en" ? post.descriptionEn : post.descriptionZh}</p>
                    <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-fg transition-colors group-hover:text-brand">
                      {locale === "en" ? "Read the field note" : "听完这个故事"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </MarketingResourceLink>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ---------- Pricing ---------- */}
        <section ref={pricingRef} id="pricing" className="mx-auto max-w-[1600px] px-5 py-20 sm:py-28">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-4xl">{c.pricingTitle}</h2>
            <p className="mt-3 text-base text-fg-muted">{c.pricingSub}</p>
          </Reveal>
          <Stagger className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-5" gap={0.1} amount={0.2}>
            {PRICING_PLAN_ORDER.map((key) => {
              const plan = PRICING_PLANS[key];
              const planCopy = getLocalizedPlanCopy(key, locale);
              const market = marketForLocale(locale);
              const isHL = plan.highlighted;
              const isFree = key === "free";
              return (
                <StaggerItem key={key}>
                  <article
                    className={`relative flex h-full flex-col rounded-2xl p-6 transition-transform duration-300 ${
                      isHL
                        ? "glass border-2 border-brand/60 lg:-translate-y-2"
                        : key === "digital_employee"
                          ? "panel lift border border-brand/30 bg-brand/[0.035]"
                          : "panel lift"
                    }`}
                  >
                    {isHL && (
                      <>
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-brand/80 to-transparent"
                        />
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-2xl bg-[radial-gradient(60%_100%_at_50%_0%,rgb(var(--brand)/0.09),transparent_75%)]"
                        />
                      </>
                    )}
                    {isHL && (
                      <span className="eyebrow-mono absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-strong to-brand px-3 py-1 italic text-bg shadow-glow-brand">
                        <Star className="mr-1 inline h-3 w-3 fill-current" />
                        {planCopy.badge}
                      </span>
                    )}
                    <h3 className="text-base font-semibold text-fg">{planCopy.name}</h3>
                    <p className="tabular mt-3 whitespace-nowrap text-3xl font-semibold tracking-tight text-fg">
                      {formatPlanPrice(plan, market)}
                      <span className="text-sm font-normal text-fg-muted"> / {locale === "en" ? "month" : "月"}</span>
                    </p>
                    <p className={`mt-2 text-xs font-semibold ${isHL ? "text-brand" : "text-fg-muted"}`}>{planCopy.allowance}</p>
                    <p className="mt-4 min-h-[4.5rem] text-sm leading-6 text-fg-muted">{planCopy.description}</p>
                    <ul className="mt-5 flex-1 space-y-2.5">
                      {planCopy.features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2 text-[13px] leading-5 text-fg">
                          <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isHL ? "text-brand" : "text-positive"}`} />
                          {feat}
                        </li>
                      ))}
                    </ul>
                    {planCopy.exclusions?.length ? (
                      <ul className="mt-5 space-y-1.5 border-t border-hairline pt-4" aria-label={locale === "en" ? "Not included" : "暂不包含"}>
                        {planCopy.exclusions.map((item) => (
                          <li key={item} className="flex gap-2 text-[11px] leading-5 text-fg-muted">
                            <span aria-hidden className="text-fg-subtle">—</span>{item}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <Link
                      href={isFree ? APP_ENTRY_HREF : `/billing?plan=${key}`}
                      aria-label={`${planCopy.cta} — ${planCopy.name}`}
                      onClick={() => captureEvent("pricing_plan_cta_clicked", {
                        locale,
                        market,
                        currency: plan.currency[market],
                        plan_key: key,
                        billing_period: "monthly",
                        price: plan.price[market],
                        source_page: "landing",
                        is_existing_user: false
                      })}
                      className={`focus-ring mt-6 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                        isHL
                          ? "btn-primary"
                          : "border border-hairline bg-surface text-fg hover:border-brand/50 hover:bg-surface-2"
                      }`}
                    >
                      {planCopy.cta}
                    </Link>
                  </article>
                </StaggerItem>
              );
            })}
          </Stagger>

          <Reveal delay={0.15}>
            <div className="mt-10 rounded-2xl border border-hairline bg-surface/60 p-5 sm:p-6">
              <p className="eyebrow-mono">{locale === "en" ? "WHICH PLAN FITS ME?" : "哪个套餐更适合我？"}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {PLAN_SCENARIOS[locale].map((item) => {
                  const scenarioPlan = PRICING_PLANS[item.plan];
                  return (
                    <Link
                      key={item.plan}
                      href={item.plan === "free" ? APP_ENTRY_HREF : `/billing?plan=${item.plan}`}
                      className="focus-ring group rounded-xl border border-hairline bg-surface-2 p-4 transition hover:border-brand/50 hover:bg-brand/[0.06]"
                    >
                      <p className="text-sm leading-6 text-fg-muted">{item.scenario}</p>
                      <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-fg group-hover:text-brand">
                        {scenarioPlan.copy[locale].name}<ArrowRight className="h-3.5 w-3.5" />
                      </p>
                    </Link>
                  );
                })}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ---------- Final CTA — dawn on the horizon ---------- */}
        <section className="relative overflow-hidden">
          {/* dual-tone glow rising from the bottom edge */}
          <div
            className="rk-breathe pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(60% 70% at 50% 100%, rgb(var(--brand) / 0.20), transparent 70%), radial-gradient(40% 50% at 78% 108%, rgb(var(--accent) / 0.10), transparent 70%)"
            }}
            aria-hidden
          />
          {/* film grain so the glow reads as atmosphere, not flat wash */}
          <div aria-hidden className="grain-local pointer-events-none absolute inset-0 -z-10" />
          {/* free-library Lottie (LottieFiles, Lottie Simple License) —
              sparkles 作为横贯整屏的地平线光带，衬托主视觉 */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-[38%] opacity-45"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
          >
            <BrandLottie src="/lottie/sparkles.json" className="mx-auto aspect-[516/251] w-full max-w-5xl" />
          </motion.div>
          {/* the horizon line itself */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[10%] bottom-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[30%] bottom-0 h-8 bg-brand/15 blur-2xl"
          />
          <div className="relative mx-auto max-w-3xl px-5 py-24 text-center sm:py-32">
            {/* 主视觉：纸飞机在标题正上方升空 —— “有产品，就要让更多人知道” */}
            <Reveal>
              <motion.div
                aria-hidden
                className="mx-auto mb-4 w-40 sm:mb-6 sm:w-56"
                animate={{ y: [0, -18, 0], rotate: [-3, 3, -3] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              >
                <BrandLottie src="/lottie/send.json" className="aspect-square w-full" />
              </motion.div>
            </Reveal>
            <Reveal>
              <h2 className="text-pretty text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-5xl">
                {c.finalCtaTitle}
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mx-auto mt-5 max-w-xl text-base text-fg-muted">{c.finalCtaSub}</p>
            </Reveal>
            <Reveal delay={0.24}>
              <motion.span
                className="mt-8 inline-block"
                whileHover={{ scale: 1.045 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 320, damping: 18 }}
              >
                <Link href={APP_ENTRY_HREF} className="btn-primary focus-ring inline-flex items-center gap-2 px-7 py-3.5 text-base">
                  {c.finalCtaButton} <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.span>
              <p className="mt-4 text-xs text-fg-muted">{c.finalCtaNote}</p>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  The Reel — sample drafts flowing through the content wall         */
/* ------------------------------------------------------------------ */
const REEL_STATUS = {
  zh: ["撰写中", "排版中", "评分中", "已就绪"],
  en: ["Drafting", "Sizing", "Scoring", "Ready"]
} as const;

const REEL_CARDS: ReadonlyArray<{
  platform: string;
  zh: string;
  en: string;
  tagZh: string;
  tagEn: string;
  score: number;
}> = [
  { platform: "xiaohongshu", zh: "新品上线的 3 个细节,第 2 个最打动老用户…", en: "3 details in today's launch — #2 is what long-time users asked for…", tagZh: "封面 3:4", tagEn: "Cover 3:4", score: 94 },
  { platform: "x", zh: "今天上线:一条更新,全平台就绪。", en: "Shipping today: one update → every platform.", tagZh: "1600×900", tagEn: "1600×900", score: 91 },
  { platform: "wechat", zh: "我们为什么重写了整个编辑器", en: "Why we rewrote our editor from scratch", tagZh: "封面 900×383", tagEn: "Cover 900×383", score: 96 },
  { platform: "linkedin", zh: "一次发布背后的 12 个取舍", en: "The 12 tradeoffs behind this release", tagZh: "1200×627", tagEn: "1200×627", score: 89 },
  { platform: "threads", zh: "小团队怎么做持续内容?我们的答案", en: "How a tiny team ships content weekly", tagZh: "1080×1350", tagEn: "1080×1350", score: 92 },
  { platform: "medium-substack", zh: "从一条用户反馈到一个功能:完整复盘", en: "From one user email to a shipped feature: the full story", tagZh: "长文头图", tagEn: "Hero image", score: 95 },
  { platform: "product-hunt", zh: "首日发布文案 + 首图已备好", en: "Launch-day copy and gallery, ready", tagZh: "图标 240×240", tagEn: "Icon 240×240", score: 90 },
  { platform: "instagram", zh: "九宫格拆条:发布周的视觉故事", en: "A 9-grid story for launch week", tagZh: "1:1 × 9", tagEn: "1:1 × 9", score: 93 }
];

function ReelCard({ card, locale, index }: { card: (typeof REEL_CARDS)[number]; locale: Locale; index: number }) {
  const platform = platforms.find((p) => p.id === card.platform);
  const status = REEL_STATUS[locale];
  return (
    <article className="rounded-xl border border-hairline bg-surface-2/70 p-3.5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface">
          {platform ? <PlatformGlyph platform={platform.id} className="h-4 w-4" /> : null}
        </span>
        <span className="truncate text-xs font-semibold text-fg">{platform?.shortLabel ?? card.platform}</span>
        <span className="ml-auto shrink-0 rounded-full border border-hairline bg-fg/[0.05] px-2 py-0.5 text-[10px] font-medium text-fg-muted">
          {locale === "zh" ? card.tagZh : card.tagEn}
        </span>
      </div>
      <p className="mt-2.5 line-clamp-2 min-h-[2.5rem] text-[12.5px] leading-5 text-fg/90">
        {locale === "zh" ? card.zh : card.en}
      </p>
      <div className="mt-3 flex items-center justify-between border-t border-hairline/70 pt-2.5">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-fg-muted">
          <span className="status-dot" />
          <CycleText words={status} intervalMs={2400 + index * 260} />
        </span>
        <span className="inline-flex items-baseline gap-1 text-[10.5px] text-fg-muted">
          {locale === "zh" ? "评分" : "Score"}
          <span className="tabular text-sm font-semibold text-brand">
            <ScoreTicker value={card.score} delay={0.2 + index * 0.08} />
          </span>
        </span>
      </div>
    </article>
  );
}

function ReelColumn({
  cards,
  locale,
  reverse = false,
  offset = 0
}: {
  cards: ReadonlyArray<(typeof REEL_CARDS)[number]>;
  locale: Locale;
  reverse?: boolean;
  offset?: number;
}) {
  const block = (keyPrefix: string, ariaHidden?: boolean) => (
    <div key={keyPrefix} className="flex flex-col gap-3 pb-3" aria-hidden={ariaHidden}>
      {cards.map((card, i) => (
        <ReelCard key={card.platform} card={card} locale={locale} index={offset + i} />
      ))}
    </div>
  );
  return (
    <div className="reel-mask h-[430px] overflow-hidden sm:h-[470px]">
      <div
        className="reel-belt flex flex-col"
        data-reverse={reverse || undefined}
        style={{ "--reel-duration": reverse ? "56s" : "46s" } as CSSProperties}
      >
        {block("a")}
        {block("b", true)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Platform spiral — 14 brand marks radiating from the Finfold core. */
/* ------------------------------------------------------------------ */
const PLATFORM_SPIRAL_COLORS: Record<
  PlatformId,
  { background: string; foreground: string }
> = {
  wechat: { background: "#07C160", foreground: "#FFFFFF" },
  xiaohongshu: { background: "#FF2442", foreground: "#FFFFFF" },
  zhihu: { background: "#0066FF", foreground: "#FFFFFF" },
  moments: { background: "#171A20", foreground: "#FFFFFF" },
  x: { background: "#0F1419", foreground: "#FFFFFF" },
  linkedin: { background: "#0A66C2", foreground: "#FFFFFF" },
  instagram: {
    background: "linear-gradient(135deg, #833AB4 0%, #FD1D1D 55%, #FCAF45 100%)",
    foreground: "#FFFFFF"
  },
  facebook: { background: "#1877F2", foreground: "#FFFFFF" },
  reddit: { background: "#FF4500", foreground: "#FFFFFF" },
  "product-hunt": { background: "#DA552F", foreground: "#FFFFFF" },
  threads: { background: "#0F1419", foreground: "#FFFFFF" },
  "hacker-news": { background: "#FF6600", foreground: "#FFFFFF" },
  "indie-hackers": { background: "#0E2439", foreground: "#FFFFFF" },
  "medium-substack": { background: "#FF6719", foreground: "#FFFFFF" }
};

const SPIRAL_TURNS = 2.35;
const SPIRAL_START_ANGLE = -96;
const SPIRAL_PATH_POINTS = Array.from({ length: 120 }, (_, index) => {
  const progress = index / 119;
  const radius = 70 + progress * 176;
  const angle = (SPIRAL_START_ANGLE + progress * 360 * SPIRAL_TURNS) * (Math.PI / 180);
  const x = Math.round(300 + Math.sin(angle) * radius);
  const y = Math.round(300 - Math.cos(angle) * radius);
  return `${x},${y}`;
}).join(" ");

function SpiralPlatformChip({
  platform,
  angle,
  radius,
  progress
}: {
  platform: (typeof platforms)[number];
  angle: number;
  radius: number;
  progress: number;
}) {
  const colors = PLATFORM_SPIRAL_COLORS[platform.id];

  return (
    <div
      className="absolute left-1/2 top-1/2"
      style={{ transform: `rotate(${angle}deg) translateY(calc(var(--spiral-unit) * ${-radius}))` }}
    >
      <div style={{ transform: `translate(-50%, -50%) rotate(${-angle}deg)` }}>
        <div className="spiral-upright">
          <span
            title={platform.shortLabel}
            className="spiral-platform-chip flex items-center justify-center rounded-[32%] border border-white/25 shadow-raised"
            style={
              {
                "--spiral-chip-size": `${34 + progress * 16}px`,
                "--spiral-glyph-size": `${16 + progress * 7}px`,
                background: colors.background,
                color: colors.foreground
              } as CSSProperties
            }
          >
            <PlatformGlyph platform={platform.id} className="spiral-platform-glyph" />
          </span>
        </div>
      </div>
    </div>
  );
}

function PlatformOrbit({ locale }: { locale: Locale }) {
  return (
    <div
      className="spiral-stage relative mx-auto"
      role="img"
      aria-label={locale === "zh" ? "14 个内容平台沿螺旋汇聚到 Finfold" : "14 content platforms connected through Finfold"}
    >
      <div aria-hidden className="absolute inset-[15%] rounded-full bg-brand/[0.09] blur-3xl" />

      <div className="spiral-spin" aria-hidden>
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 600 600">
          <polyline
            points={SPIRAL_PATH_POINTS}
            fill="none"
            vectorEffect="non-scaling-stroke"
            className="spiral-path"
          />
        </svg>

        {platforms.map((platform, index) => {
          const progress = index / (platforms.length - 1);
          const angle = SPIRAL_START_ANGLE + progress * 360 * SPIRAL_TURNS;
          const radius = 4.8 + progress * 11.9;

          return (
            <SpiralPlatformChip
              key={platform.id}
              platform={platform}
              angle={angle}
              radius={radius}
              progress={progress}
            />
          );
        })}

        <span className="spiral-tracer" />
      </div>

      {/* breathing core */}
      <motion.div
        aria-hidden
        className="absolute inset-0 m-auto h-20 w-20 rounded-full bg-brand/20 blur-xl sm:h-24 sm:w-24"
        animate={{ scale: [1, 1.22, 1], opacity: [0.45, 0.75, 0.45] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 m-auto flex flex-col items-center justify-center">
        <FishLogo
          variant="app-icon"
          className="h-16 w-16 rounded-[22%] shadow-raised sm:h-20 sm:w-20"
        />
        <span className="mt-2 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-fg-muted">
          Finfold
        </span>
      </div>
    </div>
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.02 11.02 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
    </svg>
  );
}
