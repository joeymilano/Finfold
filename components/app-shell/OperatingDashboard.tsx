"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileStack,
  Library,
  ShieldCheck
} from "lucide-react";
import { AreaTrend } from "@/components/ui/AreaTrend";
import { Panel } from "@/components/ui/Panel";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Sparkline } from "@/components/ui/Sparkline";
import { StatCard } from "@/components/ui/StatCard";
import { Tag, type TagTone } from "@/components/ui/Tag";
import { agentMetrics, agentWorkflows, type AgentWorkflowStatus } from "@/lib/agent-data";
import {
  assetLibrary,
  contentHealth,
  executiveMetrics,
  growthOpportunities,
  northStarTrend,
  packages,
  packageStatusLabels,
  platformOps,
  reviewQueue,
  weeklySchedule,
  type ExecutiveMetric
} from "@/lib/ops-data";
import { useLocale } from "@/hooks/useLocale";

type OpsStatus = "healthy" | "attention" | "gap";

const statTone: Record<ExecutiveMetric["tone"], "neutral" | "good" | "warn" | "risk"> = {
  neutral: "neutral",
  good: "good",
  warn: "warn",
  risk: "risk"
};

const packageStatusTone: Record<string, TagTone> = {
  待审核: "warn",
  已批准: "success",
  排期中: "accent",
  需补齐: "risk"
};

// deterministic coverage history ending at the platform's current coverage
function coverageTrend(coverage: number): number[] {
  const start = Math.max(20, coverage - 26);
  return Array.from({ length: 7 }, (_, i) => Math.round(start + ((coverage - start) * i) / 6));
}

const pageMotion = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 }
};

export function OperatingDashboard() {
  const locale = useLocale();

  const platformStatus: Record<OpsStatus, { label: string; tone: TagTone }> = {
    healthy: { label: locale === "en" ? "Healthy" : "健康", tone: "success" },
    attention: { label: locale === "en" ? "Attention" : "关注", tone: "warn" },
    gap: { label: locale === "en" ? "Gap" : "缺口", tone: "risk" }
  };

  const workflowStatus: Record<AgentWorkflowStatus, { label: string; tone: TagTone; live?: boolean }> = {
    running: { label: locale === "en" ? "Scanning" : "巡检中", tone: "brand", live: true },
    ready: { label: locale === "en" ? "Ready" : "待派单", tone: "accent" },
    review: { label: locale === "en" ? "In Review" : "待审核", tone: "warn" },
    paused: { label: locale === "en" ? "Paused" : "已暂停", tone: "neutral" }
  };

  const copy = locale === "en" ? {
    systemTag: "Cross-platform Content OS",
    eyebrow: "Growth Dashboard",
    weekLabel: "8-week",
    thisProduct: "This product",
    benchmark: "Benchmark",
    openWorkbench: "Open Workbench",
    viewSchedule: "View schedule",
    dailyBrief: "Daily Brief",
    highPriorityCount: "3 high-priority actions",
    agentCenter: "Agent Command Center",
    agentSubtitle: "Automated content operations",
    agentDescription: "Agents monitor platform performance and content gaps, invoke Workbench production, apply brand Guardrails for QA and scheduling, and escalate judgment calls to humans.",
    openAgentCenter: "Open Agent Center",
    automationEyebrow: "Automation",
    runningAutomation: "Running automations",
    platformEyebrow: "Platform Operations",
    platformTitle: "Platform status",
    viewPackages: "View packages",
    coverageLabel: "Coverage",
    readyLabel: "Ready",
    reviewLabel: "Review",
    scheduledLabel: "Scheduled",
    recentPerf: "Recent performance",
    reach: "reach",
    contentQA: "Content QA",
    assetHealth: "Asset health",
    reviewQueue: "Review queue",
    pendingTasks: "Pending tasks",
    reviewTag: "Review",
    calendarEyebrow: "Publishing Calendar",
    calendarTitle: "This week's schedule",
    postsUnit: "posts",
    packagesEyebrow: "Growth Packages",
    packagesTitle: "Recent packages",
    openLabel: "Open",
    assetsEyebrow: "Product Assets",
    assetsTitle: "Asset library",
  } : {
    systemTag: "跨平台内容运营系统",
    eyebrow: "仪表板",
    weekLabel: "近 8 周",
    thisProduct: "本产品",
    benchmark: "同类基准",
    openWorkbench: "去创作",
    viewSchedule: "查看日程",
    dailyBrief: "今日概览",
    highPriorityCount: "3 个高优先级动作",
    agentCenter: "AI 助手",
    agentSubtitle: "帮你发现下一步该做什么",
    agentDescription: "AI 助手会根据内容缺口、品牌规则和已保存内容，给出下一步创作建议。需要你确认的地方，会留给你判断。",
    openAgentCenter: "打开 AI 助手",
    automationEyebrow: "自动流程",
    runningAutomation: "正在运行",
    platformEyebrow: "平台概览",
    platformTitle: "平台状态",
    viewPackages: "查看内容库",
    coverageLabel: "平台覆盖率",
    readyLabel: "可发布",
    reviewLabel: "待审核",
    scheduledLabel: "排期",
    recentPerf: "近期表现",
    reach: "触达",
    contentQA: "内容质检",
    assetHealth: "资产健康度",
    reviewQueue: "审核队列",
    pendingTasks: "待处理任务",
    reviewTag: "待审核",
    calendarEyebrow: "发布日历",
    calendarTitle: "本周发布节奏",
    postsUnit: "条",
    packagesEyebrow: "增长资产包",
    packagesTitle: "近期资产包",
    openLabel: "打开",
    assetsEyebrow: "产品资产",
    assetsTitle: "产品资产库",
  };

  return (
    <motion.div {...pageMotion} className="grid gap-6 pb-10">
      {/* ── Hero: north-star growth + today brief ───────────────── */}
      <section className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
        <Panel className="overflow-hidden p-5 md:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="brand" dot>
              {copy.systemTag}
            </Tag>
            <span className="eyebrow">{copy.eyebrow}</span>
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">
                {locale === "en" ? northStarTrend.labelEn : northStarTrend.label} · {copy.weekLabel}
              </p>
              <div className="mt-2 flex items-end gap-3">
                <span className="tabular text-5xl font-semibold leading-none text-fg">
                  {northStarTrend.value}
                </span>
                <span className="tag tag-success mb-1">▲ {northStarTrend.delta}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-fg-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-full bg-brand" />
                {locale === "en" ? northStarTrend.series[0].labelEn : northStarTrend.series[0].label}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0 w-4 border-t-2 border-dashed border-accent" />
                {locale === "en" ? northStarTrend.series[1].labelEn : northStarTrend.series[1].label}
              </span>
            </div>
          </div>

          <AreaTrend
            className="mt-4"
            height={200}
            series={northStarTrend.series}
            labels={northStarTrend.labels}
            formatValue={(n) => `${n}${northStarTrend.unit}`}
          />

          <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-muted">
            {locale === "en" ? northStarTrend.captionEn : northStarTrend.caption}
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link href="/workbench" className="btn-primary focus-ring">
              {copy.openWorkbench} <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/calendar" className="btn-ghost focus-ring">
              {copy.viewSchedule} <CalendarDays className="h-4 w-4" />
            </Link>
          </div>
        </Panel>

        {/* Today command brief — stays dark in both themes */}
        <Panel command className="flex flex-col p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand">
              <span className="status-dot" />
              {copy.dailyBrief}
            </div>
            <span className="text-xs text-white/50">{copy.highPriorityCount}</span>
          </div>

          <div className="mt-4 grid flex-1 content-start gap-3">
            {growthOpportunities.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.08 * index, duration: 0.38 }}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {locale === "en" ? item.titleEn : item.title}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-white/60">
                      {locale === "en" ? item.detailEn : item.detail}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">
                    {item.impact}
                  </span>
                </div>
                <Link
                  href="/workbench"
                  className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-brand"
                >
                  {locale === "en" ? item.actionEn : item.action} <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </motion.div>
            ))}
          </div>
        </Panel>
      </section>

      {/* ── Executive metrics ───────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {executiveMetrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index, duration: 0.35 }}
          >
            <StatCard
              label={locale === "en" ? metric.labelEn : metric.label}
              value={metric.value}
              detail={locale === "en" ? metric.detailEn : metric.detail}
              delta={metric.delta}
              trend={metric.trend ? [...metric.trend] : undefined}
              tone={statTone[metric.tone]}
            />
          </motion.div>
        ))}
      </section>

      {/* ── Agent command center ────────────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel command className="p-5 md:p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand">
            <Bot className="h-4 w-4" />
            {copy.agentCenter}
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white">{copy.agentSubtitle}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            {copy.agentDescription}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {agentMetrics.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xs text-white/50">
                  {locale === "en" ? metric.labelEn : metric.label}
                </p>
                <p className="tabular mt-1 text-xl font-semibold text-white">{metric.value}</p>
              </div>
            ))}
          </div>
          <Link href="/agents" className="btn-primary focus-ring mt-5">
            {copy.openAgentCenter} <ArrowRight className="h-4 w-4" />
          </Link>
        </Panel>

        <Panel className="p-5">
          <SectionHeader eyebrow={copy.automationEyebrow} title={copy.runningAutomation} icon={Bot} />
          <div className="mt-4 grid gap-3">
            {agentWorkflows.slice(0, 4).map((workflow) => {
              const status = workflowStatus[workflow.status];
              return (
                <Link
                  key={workflow.id}
                  href="/agents"
                  className="panel-inset flex items-center justify-between gap-4 p-3 transition hover:border-brand/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                      <workflow.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-fg">
                        {locale === "en" ? workflow.nameEn : workflow.name}
                      </p>
                      <p className="mt-0.5 text-xs text-fg-muted">
                        {workflow.agent} · {locale === "en" ? workflow.cadenceEn : workflow.cadence}
                      </p>
                    </div>
                  </div>
                  <Tag tone={status.tone} dot={status.live}>
                    {status.label}
                  </Tag>
                </Link>
              );
            })}
          </div>
        </Panel>
      </section>

      {/* ── Platform operations matrix + health/review sidebar ──── */}
      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Panel className="p-4 md:p-5">
          <SectionHeader
            eyebrow={copy.platformEyebrow}
            title={copy.platformTitle}
            action={
              <Link href="/packages" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-strong dark:text-brand">
                {copy.viewPackages} <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />

          <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {platformOps.map((platform, index) => {
              const status = platformStatus[platform.status];
              return (
                <motion.article
                  key={platform.id}
                  whileHover={{ y: -3 }}
                  transition={{ duration: 0.18 }}
                  className="panel panel-hover flex flex-col p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-fg">
                        <platform.icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-semibold text-fg">{platform.name}</h3>
                        <p className="text-xs font-medium text-fg-muted">{platform.region}</p>
                      </div>
                    </div>
                    <Tag tone={status.tone} dot={platform.status === "healthy"}>
                      {status.label}
                    </Tag>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs font-semibold text-fg-muted">
                      <span>{copy.coverageLabel}</span>
                      <span className="tabular text-fg">{platform.coverage}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${platform.coverage}%` }}
                        transition={{ delay: 0.05 * index, duration: 0.6 }}
                        className="h-full rounded-full bg-brand"
                      />
                    </div>
                    <Sparkline
                      values={coverageTrend(platform.coverage)}
                      tone={platform.status === "gap" ? "accent" : "brand"}
                      className="mt-3 h-8 w-full"
                      height={32}
                      width={240}
                    />
                  </div>

                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {[
                      { k: copy.readyLabel, v: platform.readyAssets },
                      { k: copy.reviewLabel, v: platform.pendingReview },
                      { k: copy.scheduledLabel, v: platform.scheduled }
                    ].map((cell) => (
                      <div key={cell.k} className="panel-inset p-2">
                        <dt className="text-[11px] text-fg-muted">{cell.k}</dt>
                        <dd className="tabular mt-1 text-lg font-semibold text-fg">{cell.v}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="panel-inset mt-4 p-3">
                    <p className="text-xs font-semibold text-fg-muted">{copy.recentPerf}</p>
                    <p className="mt-1 text-sm font-semibold text-fg">
                      {platform.sevenDayReach} {copy.reach} · {locale === "en" ? platform.conversionSignalEn : platform.conversionSignal}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-fg-muted">
                      {locale === "en" ? platform.recommendedActionEn : platform.recommendedAction}
                    </p>
                  </div>

                  <Link href={platform.href} className="btn-ghost focus-ring mt-4 w-full">
                    {locale === "en" ? platform.nextTaskEn : platform.nextTask} <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.article>
              );
            })}
          </div>
        </Panel>

        <aside className="grid content-start gap-6">
          <Panel className="p-5">
            <SectionHeader eyebrow={copy.contentQA} title={copy.assetHealth} icon={ShieldCheck} />
            <div className="mt-5 grid gap-4">
              {contentHealth.map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-fg">
                      <item.icon className="h-4 w-4 text-fg-muted" />
                      {locale === "en" ? item.labelEn : item.label}
                    </div>
                    <span className="tabular text-sm font-semibold text-fg">{item.value}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${item.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <SectionHeader eyebrow={copy.reviewQueue} title={copy.pendingTasks} icon={Clock3} />
            <div className="mt-4 grid gap-3">
              {reviewQueue.map((item) => (
                <div key={item.title} className="panel-inset p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-fg">
                        {locale === "en" ? item.titleEn : item.title}
                      </h3>
                      <p className="mt-1 text-xs text-fg-muted">
                        {item.platform} · {item.owner} · {locale === "en" ? item.dueEn : item.due}
                      </p>
                    </div>
                    <Tag tone="warn">{copy.reviewTag}</Tag>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-fg-muted">
                    {locale === "en" ? item.riskEn : item.risk}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </section>

      {/* ── Calendar + packages ─────────────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel className="p-5">
          <SectionHeader eyebrow={copy.calendarEyebrow} title={copy.calendarTitle} icon={CalendarDays} />
          <div className="mt-5 grid gap-3">
            {weeklySchedule.map((day) => (
              <div
                key={day.day}
                className="panel-inset grid grid-cols-[56px_1fr_auto] items-center gap-3 p-3"
              >
                <span className="text-sm font-semibold text-fg">{day.day}</span>
                <div>
                  <p className="text-sm font-semibold text-fg">
                    {locale === "en" ? day.focusEn : day.focus}
                  </p>
                  <p className="mt-1 text-xs text-fg-muted">{day.platforms.join(" / ")}</p>
                </div>
                <Tag tone="neutral">{day.count} {copy.postsUnit}</Tag>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-5">
          <SectionHeader eyebrow={copy.packagesEyebrow} title={copy.packagesTitle} icon={FileStack} />
          <div className="mt-5 overflow-hidden rounded-xl border border-hairline">
            {packages.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 border-b border-hairline p-4 last:border-b-0 md:grid-cols-[1fr_auto]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-fg">{item.product}</h3>
                    <span className="text-xs text-fg-muted">{item.id}</span>
                    <Tag tone={packageStatusTone[item.status] ?? "neutral"}>
                      {packageStatusLabels[item.status][locale]}
                    </Tag>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-fg-muted">
                    {locale === "en" ? item.impactEn : item.impact}
                  </p>
                  <p className="mt-2 text-xs text-fg-muted">
                    {item.platforms.join(" / ")} · {item.owner} · {item.updatedAt}
                  </p>
                </div>
                <Link
                  href="/packages"
                  className="inline-flex items-center justify-center gap-1 self-center text-sm font-semibold text-brand-strong dark:text-brand"
                >
                  {copy.openLabel} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      {/* ── Product assets ──────────────────────────────────────── */}
      <section>
        <Panel className="p-5">
          <SectionHeader eyebrow={copy.assetsEyebrow} title={copy.assetsTitle} icon={Library} />
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {assetLibrary.map((asset) => (
              <div key={asset.name} className="panel-inset flex items-start justify-between gap-4 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-fg">
                    {locale === "en" ? asset.nameEn : asset.name}
                  </h3>
                  <p className="mt-1 text-sm text-fg-muted">
                    {locale === "en" ? asset.typeEn : asset.type} · {locale === "en" ? asset.freshnessEn : asset.freshness}
                  </p>
                  <p className="mt-2 text-xs font-medium text-fg-muted">
                    {locale === "en" ? asset.guardrailEn : asset.guardrail}
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 shrink-0 text-brand" />
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </motion.div>
  );
}
