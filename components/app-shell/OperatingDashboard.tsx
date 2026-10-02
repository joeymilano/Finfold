"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WeeklyPlanCard } from "@/components/app-shell/WeeklyPlanCard";
import { OperatingWeeklyQueueCard } from "@/components/app-shell/OperatingWeeklyQueue";
import { WeeklyGrowthPulse } from "@/components/app-shell/WeeklyGrowthPulse";
import { CampaignPlanCard } from "@/components/app-shell/CampaignPlanCard";
import { motion } from "motion/react";
import {
  ArrowRight,
  Bot,
  Brain,
  CircleDotDashed,
  FileStack,
  Globe2,
  Radio,
  Sparkles,
  Target,
  TrendingUp,
  WandSparkles
} from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { BrandLottie } from "@/components/visual/brand-lottie";
import { buttonStyles } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import type { ContentKit } from "@/lib/content-schema";
import { getGoal } from "@/lib/goals";
import { getPlatform } from "@/lib/platforms";
import { PlatformGlyph } from "@/components/workbench/PlatformBrandIcon";
import type { PlatformId } from "@/lib/platforms";
import { useLocale } from "@/hooks/useLocale";
import type { AgentPatrolItem } from "@/lib/agent/patrol";
import type { OperatingProgram } from "@/lib/operations/program";
import type { OperatingWeeklyQueue } from "@/lib/operations/weekly-tasks";
import { StarterMissionIntake } from "@/components/app-shell/StarterMissionIntake";
import { DemandSignalQueue } from "@/components/app-shell/DemandSignalQueue";

type Entitlement = {
  authenticated: boolean;
  plan: string;
};

export type GrowthSummary = {
  toReview: number;
  awaitingMetrics: number;
  closedLoops: number;
  publishedThisWeek: number;
  daysSinceLastPublish: number | null;
  automatedSignalsThisWeek: number;
  outcomes: { engagement: number; leads: number; signups: number; revenue: number };
  learnedRules: Array<{ kind: "style" | "avoid" | "performance"; text: string }>;
  nextAction: { kind: "create" | "review" | "measure" | "next-cycle"; href: string };
  dutyItem?: AgentPatrolItem | null;
};

const EMPTY_SUMMARY: GrowthSummary = {
  toReview: 0,
  awaitingMetrics: 0,
  closedLoops: 0,
  publishedThisWeek: 0,
  daysSinceLastPublish: null,
  automatedSignalsThisWeek: 0,
  outcomes: { engagement: 0, leads: 0, signups: 0, revenue: 0 },
  learnedRules: [],
  nextAction: { kind: "create", href: "/workbench" },
  dutyItem: null
};

export function OperatingDashboard() {
  const locale = useLocale();
  const [kits, setKits] = useState<ContentKit[]>([]);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [growthSummary, setGrowthSummary] = useState<GrowthSummary>(EMPTY_SUMMARY);
  const [operatingProgram, setOperatingProgram] = useState<OperatingProgram | null>(null);
  const [operatingQueue, setOperatingQueue] = useState<OperatingWeeklyQueue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const entRes = await fetch("/api/entitlements/check", { method: "POST", cache: "no-store" });
        const ent = (await entRes.json()) as Entitlement;
        if (cancelled) return;
        setEntitlement(ent);

        if (ent.authenticated) {
          const [kitsResponse, summaryResponse, programResponse, queueResponse] = await Promise.all([
            fetch("/api/kits", { cache: "no-store" }),
            fetch("/api/dashboard/summary", { cache: "no-store" }),
            fetch("/api/operations/program", { cache: "no-store" }),
            fetch("/api/operations/program/tasks", { cache: "no-store" })
          ]);
          const data = (await kitsResponse.json()) as { kits?: ContentKit[] };
          const summaryData = (await summaryResponse.json()) as { summary?: GrowthSummary };
          const programData = (await programResponse.json()) as { program?: OperatingProgram | null };
          const queueData = (await queueResponse.json()) as { queue?: OperatingWeeklyQueue | null };
          if (!cancelled) {
            setKits(data.kits ?? []);
            setGrowthSummary(summaryData.summary ?? EMPTY_SUMMARY);
            setOperatingProgram(programData.program ?? null);
            setOperatingQueue(queueData.queue ?? null);
          }
        } else {
          setKits([]);
        }
      } catch {
        if (!cancelled) setKits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = locale === "en" ? {
    eyebrow: "Finfold Dashboard",
    title: "Your content operations at a glance",
    cycleTitle: "One product update, ready for every channel",
    cycleBody: "Tweak it, publish, then log the results — the next draft gets smarter.",
    create: "Create in Workbench",
    askAgent: "Ask Agent",
    saved: "Saved Kits",
    totalKits: "Total kits",
    totalKitsDetail: "Generated so far",
    thisMonth: "This month",
    thisMonthDetail: "of monthly limit",
    channels: "Channels covered",
    channelsDetail: "Distinct platforms used",
    recentTitle: "Recent kits",
    recentDetail: "Your latest generated content kits.",
    channelsSectionTitle: "Channel coverage",
    channelsSectionDetail: "Platforms you've generated content for.",
    emptyTitle: "No content kits yet",
    emptyBody: "Generate your first kit in the Workbench to turn one product note into platform-native drafts.",
    emptyCta: "Open Workbench",
    viewAll: "View all",
    guestTitle: "Sign in to see your dashboard",
    guestBody: "Your real metrics, recent kits, and channel coverage appear here once you log in and start generating.",
    guestCta: "Try the Workbench",
    hello: "Welcome to Finfold",
    emptyHeroTitle: "Turn one product note into content for every channel",
    emptyHeroBody: "Paste a single update and get platform-native drafts for Xiaohongshu, X, LinkedIn and more — in about 30 seconds.",
    emptyInputPh: "Paste a product update, release note, or customer insight here…",
    emptyChips: ["Product update", "New feature", "Customer insight", "Founder note"],
    startCreate: "Start creating",
    seeExample: "See an example",
    platformsLabel: "platforms",
    outputsLabel: "outputs"
  } : {
    eyebrow: "Finfold 仪表板",
    title: "你的内容运营总览",
    cycleTitle: "一条产品动态，自动变成各平台文案",
    cycleBody: "改一改就能发。把发布后的效果记下来，下次生成更懂你的风格。",
    create: "去创作台执行",
    askAgent: "问 AI 助手",
    saved: "内容库",
    totalKits: "内容包总数",
    totalKitsDetail: "累计已生成",
    thisMonth: "本月使用",
    thisMonthDetail: "本月额度",
    channels: "覆盖渠道",
    channelsDetail: "已使用的平台数",
    recentTitle: "最近的内容包",
    recentDetail: "你最近生成的内容包。",
    channelsSectionTitle: "渠道覆盖",
    channelsSectionDetail: "你已经生成过内容的平台。",
    emptyTitle: "还没有内容包",
    emptyBody: "去创作台生成第一个内容包，把一条产品更新变成各平台原生草稿。",
    emptyCta: "打开创作台",
    viewAll: "查看全部",
    guestTitle: "登录后查看你的仪表板",
    guestBody: "登录并开始生成后，这里会显示你的真实数据、最近内容包和渠道覆盖。",
    guestCta: "试用创作台",
    hello: "你好 👋",
    emptyHeroTitle: "把一条产品动态，变成全平台内容",
    emptyHeroBody: "粘贴一段更新，30 秒生成小红书、即刻、X、公众号…各平台原生文案。",
    emptyInputPh: "把你的产品更新、发布说明、或一条用户反馈粘在这里…",
    emptyChips: ["产品更新", "新功能上线", "用户反馈", "创始人观点"],
    startCreate: "开始创作",
    seeExample: "先看一个示例",
    platformsLabel: "个平台",
    outputsLabel: "条内容"
  };

  // ── Derived real metrics ──────────────────────────────────────────
  const totalKits = kits.length;

  const platformCounts = new Map<PlatformId, number>();
  for (const kit of kits) {
    for (const output of kit.outputs) {
      platformCounts.set(output.platform, (platformCounts.get(output.platform) ?? 0) + 1);
    }
  }
  const coveredPlatforms = [...platformCounts.entries()].sort((a, b) => b[1] - a[1]);

  const authenticated = entitlement?.authenticated ?? false;
  const hasKits = totalKits > 0;
  // 空态（未登录 或 已登录但还没有任何内容包）：首屏只给一个行动入口，
  // 藏起指标卡 / 下一最佳行动 / 学到了什么 等驾驶舱面板，降低新用户认知成本。
  const showStarterIntake = !loading && authenticated && !hasKits;
  const showGuestEmpty = !loading && !authenticated;
  const actionCopy = getNextActionCopy(growthSummary.nextAction.kind, locale);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto grid max-w-[1180px] gap-5 pb-10">
      {authenticated && (hasKits || operatingProgram) ? <OperatingProgramSummary program={operatingProgram} locale={locale} /> : null}
      {authenticated && operatingProgram ? <DemandSignalQueue locale={locale} keywords={operatingProgram.watchlist.keywords} /> : null}
      {authenticated && operatingQueue ? <OperatingWeeklyQueueCard queue={operatingQueue} locale={locale} /> : null}
      {authenticated && hasKits ? <WeeklyPlanCard summary={growthSummary} locale={locale} operatingQueueActive={Boolean(operatingQueue)} /> : null}
      {authenticated && hasKits ? <WeeklyGrowthPulse locale={locale} /> : null}
      {authenticated && hasKits ? <CampaignPlanCard locale={locale} /> : null}
      {showStarterIntake ? (
        <StarterMissionIntake locale={locale} />
      ) : showGuestEmpty ? (
        /* ── 空态行动首页：一个输入入口 + 单一主 CTA，零术语 ── */
        <Panel className="relative overflow-hidden p-6 md:p-8">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_12%,rgb(var(--action)/0.1),transparent_32%),linear-gradient(135deg,rgb(var(--info)/0.045),transparent_50%)]" />
          <div aria-hidden className="grain-local pointer-events-none absolute inset-0 -z-10" />
          {/* 免费库 Lottie 增长插画（LottieFiles，Lottie Simple License）—
              空态的视觉锚点，弱化"满屏文字"的单调感 */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute bottom-4 right-4 hidden w-44 opacity-90 md:block lg:right-10 lg:w-60"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          >
            <BrandLottie src="/lottie/growth.json" className="aspect-[112/93] w-full" />
          </motion.div>
          <p className="eyebrow">{copy.hello}</p>
          <h1 className="mt-3 max-w-4xl text-balance text-3xl font-black leading-tight text-fg md:text-5xl">
            {copy.emptyHeroTitle}
          </h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-fg-muted md:text-base">
            {copy.emptyHeroBody}
          </p>

          {/* 伪输入框，同时就是进入创作台的主入口 */}
          <Link
            href="/workbench"
            className="mt-6 block rounded-xl border border-hairline bg-surface-2/70 p-4 text-sm font-semibold text-fg-muted transition hover:border-action/45 hover:bg-action/[0.035] hover:text-fg md:mr-52 lg:mr-64"
          >
            {copy.emptyInputPh}
          </Link>

          {/* 示例 chips */}
          <div className="mt-3 flex flex-wrap gap-2">
            {copy.emptyChips.map((chip) => (
              <Link
                key={chip}
                href="/workbench"
                className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-fg-muted transition hover:border-action/40 hover:bg-action/[0.04] hover:text-action-strong dark:hover:text-action"
              >
                {chip}
              </Link>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/workbench" className={buttonStyles({ variant: "primary" })}>
              {copy.startCreate} <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/dashboard" className={buttonStyles({ variant: "secondary" })}>
              {copy.seeExample} <Sparkles className="h-4 w-4" />
            </Link>
          </div>
        </Panel>
      ) : (
        /* ── 有数据的老用户：行动优先 hero + 真实指标（人话版） ── */
        <Panel className="overflow-hidden p-6 md:p-8">
          <div className="max-w-5xl">
            <p className="eyebrow">{copy.eyebrow}</p>
            <div className="mt-3 mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-action/[0.11] text-action-strong dark:text-action">
              <Globe2 className="h-6 w-6" />
            </div>
            <h1 className="max-w-5xl text-balance text-3xl font-black leading-tight text-fg md:text-5xl">
              {copy.cycleTitle}
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-fg-muted md:text-base">{copy.cycleBody}</p>
          </div>

          {/* 真实指标：仅在有数据时展示，避免新用户看到满屏 0 */}
          {hasKits ? (
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <Metric
                icon={CircleDotDashed}
                label={locale === "en" ? "Ready for review" : "等你过目的草稿"}
                value={loading ? "—" : String(growthSummary.toReview)}
                detail={locale === "en" ? "Drafts waiting for a decision" : "Finfold 写好了，等你确认"}
                tone="brand"
              />
              <Metric
                icon={TrendingUp}
                label={locale === "en" ? "Awaiting results" : "发出去但没记效果"}
                value={loading ? "—" : String(growthSummary.awaitingMetrics)}
                detail={locale === "en" ? "Published, waiting on results" : "已发布，等你回填效果"}
                tone="success"
              />
              <Metric
                icon={Target}
                label={locale === "en" ? "Completed" : "已发完并复盘"}
                value={loading ? "—" : String(growthSummary.closedLoops)}
                detail={locale === "en" ? "Published and measured" : "发布和效果都已记下"}
                tone="neutral"
              />
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/workbench" className={buttonStyles({ variant: "primary" })}>
              {copy.create} <WandSparkles className="h-4 w-4" />
            </Link>
            <Link href="/dashboard" className={buttonStyles({ variant: "secondary" })}>
              {copy.askAgent} <Bot className="h-4 w-4" />
            </Link>
            <Link href="/packages" className={buttonStyles({ variant: "tertiary" })}>
              {copy.saved} <FileStack className="h-4 w-4" />
            </Link>
          </div>
        </Panel>
      )}

      {!loading && authenticated && hasKits ? (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <Panel className="p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">{locale === "en" ? "Next step" : "下一步做什么"}</p>
                <h2 className="mt-2 text-2xl font-black text-fg">{actionCopy.title}</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-fg-muted">{actionCopy.body}</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-action/[0.11] text-action-strong dark:text-action">
                <Radio className="h-5 w-5" />
              </span>
            </div>
            {growthSummary.automatedSignalsThisWeek > 0 ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-action/25 bg-action/[0.06] px-3 py-2 text-sm font-semibold text-action-strong dark:text-action">
                <Bot className="h-4 w-4 shrink-0" />
                <span>
                  {locale === "en"
                    ? `${growthSummary.automatedSignalsThisWeek} draft${growthSummary.automatedSignalsThisWeek > 1 ? "s" : ""} auto-drafted for you this week`
                    : `本周 AI 已自动帮你起草 ${growthSummary.automatedSignalsThisWeek} 条草稿`}
                </span>
              </div>
            ) : null}
            <Link href={growthSummary.nextAction.href} className={`${buttonStyles({ variant: "secondary" })} mt-5`}>
              {actionCopy.cta} <ArrowRight className="h-4 w-4" />
            </Link>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <CompactOutcome label={locale === "en" ? "Published / 7d" : "近 7 日发布"} value={growthSummary.publishedThisWeek} />
              <CompactOutcome label={locale === "en" ? "Engagement" : "累计互动"} value={growthSummary.outcomes.engagement} />
              <CompactOutcome label={locale === "en" ? "Leads" : "新增线索"} value={growthSummary.outcomes.leads} />
              <CompactOutcome label={locale === "en" ? "Signups" : "累计注册"} value={growthSummary.outcomes.signups} />
            </div>
          </Panel>

          <Panel className="p-5 md:p-6">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-action-strong dark:text-action" />
              <h2 className="text-xl font-black text-fg">{locale === "en" ? "What the AI remembered" : "AI 记住了什么"}</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-fg-muted">
              {locale === "en" ? "What you edited, published, and adopted — the AI remembers it." : "你改过的、发布过的、采纳过的，它都记着。"}
            </p>
            <div className="mt-4 grid gap-2">
              {growthSummary.learnedRules.length > 0 ? growthSummary.learnedRules.map((rule, index) => (
                <div key={`${rule.kind}-${index}`} className="panel-inset flex gap-2.5 p-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-action" />
                  <p className="text-sm font-semibold leading-5 text-fg">{rule.text}</p>
                </div>
              )) : (
                <div className="panel-inset p-4 text-sm leading-6 text-fg-muted">
                  {locale === "en" ? "Publish, edit, and log results — your memory builds over time." : "多发几条、改一改、记下效果，这里会慢慢记住你的风格。"}
                </div>
              )}
            </div>
            <Link href="/brand-memory" className="mt-4 inline-flex text-xs font-bold text-action-strong hover:underline dark:text-action">
              {locale === "en" ? "See what it remembered" : "看看它记住了什么"}
            </Link>
          </Panel>
        </section>
      ) : null}

      {/* Authenticated with data: real recent kits + channel coverage */}
      {!loading && authenticated && hasKits ? (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Recent kits */}
          <Panel className="min-w-0 p-5 md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-fg">{copy.recentTitle}</h2>
                <p className="mt-1 text-sm text-fg-muted">{copy.recentDetail}</p>
              </div>
              <Link href="/packages" className="shrink-0 text-xs font-bold text-action-strong hover:underline dark:text-action">
                {copy.viewAll}
              </Link>
            </div>

            <div className="mt-5 grid gap-3">
              {kits.slice(0, 5).map((kit) => {
                const goal = getGoal(kit.goal);
                return (
                  <Link
                    key={kit.id}
                    href={`/kits/${kit.id}`}
                    className="panel-inset block min-w-0 p-4 transition hover:border-action/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold text-fg">{kit.ideaText}</h3>
                        <p className="mt-1 text-xs font-semibold text-fg-muted">
                          {locale === "en" ? goal.labelEn : goal.label} · {formatDate(kit.createdAt, locale)}
                        </p>
                      </div>
                      <Tag tone="neutral">
                        {kit.outputs.length} {copy.outputsLabel}
                      </Tag>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {kit.platforms.slice(0, 6).map((platformId) => {
                        const platform = safePlatform(platformId);
                        if (!platform) return null;
                        return (
                          <span
                            key={platformId}
                            className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-0.5 text-[11px] font-semibold text-fg-muted"
                          >
                            <PlatformGlyph platform={platformId} className="h-3 w-3" />
                            {platform.shortLabel}
                          </span>
                        );
                      })}
                      {kit.platforms.length > 6 ? (
                        <span className="inline-flex items-center rounded-md bg-surface px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
                          +{kit.platforms.length - 6}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </Panel>

          {/* Channel coverage */}
          <Panel className="p-5 md:p-6">
            <h2 className="text-xl font-black text-fg">{copy.channelsSectionTitle}</h2>
            <p className="mt-1 text-sm text-fg-muted">{copy.channelsSectionDetail}</p>

            <div className="mt-5 grid gap-2.5">
              {coveredPlatforms.map(([platformId, count]) => {
                const platform = safePlatform(platformId);
                if (!platform) return null;
                const share = totalKits > 0 ? Math.round((count / totalKits) * 100) : 0;
                return (
                  <div key={platformId} className="panel-inset p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-action-strong dark:text-action">
                          <PlatformGlyph platform={platformId} className="h-4 w-4" />
                        </span>
                        <div className="leading-tight">
                          <p className="text-sm font-bold text-fg">{platform.label}</p>
                          <p className="text-[11px] font-semibold text-fg-muted">
                            {platform.region === "China" ? (locale === "en" ? "China" : "国内") : (locale === "en" ? "Global" : "海外")}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-black tabular text-fg">{count}</span>
                    </div>
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                      <div className="h-full rounded-full bg-action" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </section>
      ) : null}
    </motion.div>
  );
}

function OperatingProgramSummary({ program, locale }: { program: OperatingProgram | null; locale: "zh" | "en" }) {
  const en = locale === "en";
  if (!program) {
    return (
      <Panel className="relative overflow-hidden border-action/25 p-5 md:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-56 bg-[radial-gradient(circle_at_100%_50%,rgb(var(--action)/0.13),transparent_68%)]" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-action/[0.11] text-action-strong dark:text-action">
              <Target className="h-5 w-5" />
            </span>
            <div>
              <Tag tone="action">{en ? "Set the target first" : "先定义业务目标"}</Tag>
              <h2 className="mt-3 text-balance text-xl font-black text-fg md:text-2xl">
                {en ? "Tell Finfold what counts as a qualified lead" : "告诉 Finfold，什么样的咨询才算有效线索"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-fg-muted">
                {en ? "Research and Strategy need your offer, audience, conversion goal, and watchlist before they can make accountable recommendations." : "补全主推产品、目标客户、转化动作和关注列表，后续调研与策略才有明确判断标准。"}
              </p>
            </div>
          </div>
          <Link href="/operations" className={buttonStyles({ variant: "primary" })}>
            {en ? "Set up program" : "设置运营项目"} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Panel>
    );
  }

  const watchCount = program.watchlist.competitors.length + program.watchlist.keywords.length;
  return (
    <Panel className="p-5 md:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={program.status === "active" ? "success" : "warn"} dot>
              {program.status === "active" ? (en ? "Operating" : "运行中") : (en ? "Draft" : "待启动")}
            </Tag>
            <span className="text-xs font-bold text-fg-muted">{en ? "Xiaohongshu" : "小红书"}</span>
          </div>
          <h2 className="mt-3 text-balance text-xl font-black text-fg md:text-2xl">
            {program.objective.monthlyGoal || (en ? "Business goal not set" : "还没有填写本月业务目标")}
          </h2>
          <p className="mt-2 text-sm font-medium text-fg-muted">
            {program.offer.name || (en ? "Offer not set" : "主推产品待补充")} · {program.cadencePerWeek} {en ? "posts per week" : "篇每周"} · {watchCount} {en ? "research signals" : "项调研关注"}
          </p>
        </div>
        <Link href="/operations" className={buttonStyles({ variant: "secondary" })}>
          {program.status === "active" ? (en ? "Review brief" : "查看业务简报") : (en ? "Finish setup" : "继续设置")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Panel>
  );
}

function safePlatform(platformId: PlatformId) {
  try {
    return getPlatform(platformId);
  } catch {
    return null;
  }
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale === "en" ? "en-US" : "zh-CN", {
    month: "short",
    day: "numeric"
  });
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone
}: {
  icon: typeof FileStack;
  label: string;
  value: string;
  detail: string;
  tone: "brand" | "success" | "neutral";
}) {
  const toneClass = {
    brand: "bg-action/[0.11] text-action-strong dark:text-action",
    success: "bg-positive/15 text-positive",
    neutral: "bg-fg/10 text-fg-muted"
  }[tone];

  return (
    <div className="rounded-lg border border-hairline bg-surface-2 p-4">
      <div className={`flex h-9 w-9 items-center justify-center rounded-md ${toneClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-4 text-sm font-semibold text-fg-muted">{label}</p>
      <p className="mt-1 text-3xl font-black tabular text-fg">{value}</p>
      <p className="mt-1 text-xs font-semibold text-fg-muted">{detail}</p>
    </div>
  );
}

function CompactOutcome({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-2 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="mt-1 text-2xl font-black tabular text-fg">{value.toLocaleString()}</p>
    </div>
  );
}

function getNextActionCopy(kind: GrowthSummary["nextAction"]["kind"], locale: "zh" | "en") {
  const copy = {
    en: {
      create: { title: "Start with what just happened", body: "Paste an update, launch note, customer insight, or founder thought and turn it into posts ready for every channel.", cta: "Start generating" },
      review: { title: "A few drafts are waiting on you", body: "Finfold has content ready. Pick the strongest version, tweak it, and ship.", cta: "Review drafts" },
      measure: { title: "Log the results for this post", body: "A published post is waiting on its results. Add them so the next draft improves.", cta: "Log results" },
      "next-cycle": { title: "Generate the next one", body: "Your last edits and results are saved — the next draft builds on them.", cta: "Generate again" }
    },
    zh: {
      create: { title: "先把要发的东西贴进来", body: "粘贴一条产品更新、新功能、用户反馈或你的想法，自动生成各平台能直接发的文案。", cta: "开始生成" },
      review: { title: "有几条草稿等你过目", body: "Finfold 已经写好了。挑最合适的版本，改一改，就能发。", cta: "去看看草稿" },
      measure: { title: "补上这条发布后的效果", body: "有条内容已经发出去了但还没记效果。补上之后，下次生成会更准。", cta: "补上效果" },
      "next-cycle": { title: "再来一条，带着上次的经验", body: "你上次改过、记下的效果它都记住了，再生成一条会更对味。", cta: "再生成一条" }
    }
  } as const;
  return copy[locale][kind];
}
