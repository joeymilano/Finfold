"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Globe2,
  MessageSquareText,
  Sparkles,
  TrendingUp,
  WandSparkles
} from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { growthOpportunities, platformOps } from "@/lib/ops-data";
import { useLocale } from "@/hooks/useLocale";

const priorityPlatforms = platformOps.filter((platform) => ["xiaohongshu", "tiktok", "linkedin"].includes(platform.id));
const personalPlatformActions: Record<string, { zh: string; en: string }> = {
  xiaohongshu: { zh: "补齐小红书资产", en: "Fill Xiaohongshu assets" },
  linkedin: { zh: "复用成创始人帖", en: "Turn into founder posts" },
  tiktok: { zh: "优化短视频脚本", en: "Improve short video scripts" }
};

export function OperatingDashboard() {
  const locale = useLocale();
  const copy = locale === "en" ? {
    title: "Today’s go-global marketing focus",
    desc: "Keep the dashboard quiet: what is growing, what is missing, and what should be created next.",
    create: "Create in Workbench",
    askAgent: "Ask Agent",
    memory: "Update Brand Memory",
    northStar: "Cross-platform reach",
    northStarDetail: "Owned channels this week",
    approved: "Ready assets",
    approvedDetail: "Ready to reuse",
    gaps: "Priority gaps",
    gapsDetail: "Need new drafts",
    actionsTitle: "Next best actions",
    channelsTitle: "Channels to watch",
    channelLabels: { reach: "Reach", gap: "Gap", action: "Action" }
  } : {
    title: "今天最该做什么出海营销？",
    desc: "仪表板只保留决策需要的信息：哪里在增长、哪里有缺口、下一步该创作什么。",
    create: "去创作台执行",
    askAgent: "问 AI 助手",
    memory: "更新品牌记忆",
    northStar: "跨平台触达",
    northStarDetail: "本周自有渠道",
    approved: "可发布资产",
    approvedDetail: "可以直接使用",
    gaps: "优先缺口",
    gapsDetail: "需要补新内容",
    actionsTitle: "下一步动作",
    channelsTitle: "重点平台",
    channelLabels: { reach: "触达", gap: "缺口", action: "动作" }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto grid max-w-[1180px] gap-5 pb-10">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className="overflow-hidden p-6 md:p-8">
          <div className="max-w-3xl">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-brand/15 text-brand">
              <Globe2 className="h-6 w-6" />
            </div>
            <h1 className="text-4xl font-black leading-tight text-fg md:text-6xl">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-fg-muted">
              {copy.desc}
            </p>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <Metric icon={TrendingUp} label={copy.northStar} value="208.6k" detail={copy.northStarDetail} tone="brand" />
            <Metric icon={CheckCircle2} label={copy.approved} value="42" detail={copy.approvedDetail} tone="success" />
            <Metric icon={Sparkles} label={copy.gaps} value="3" detail={copy.gapsDetail} tone="risk" />
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/workbench" className="btn-primary">
              {copy.create} <WandSparkles className="h-4 w-4" />
            </Link>
            <Link href="/agents" className="btn-ghost">
              {copy.askAgent} <Bot className="h-4 w-4" />
            </Link>
            <Link href="/brand-memory" className="btn-ghost">
              {copy.memory} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Panel>

        <Panel command className="p-5 md:p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand">
            <Bot className="h-4 w-4" />
            {copy.actionsTitle}
          </div>
          <div className="mt-4 grid gap-3">
            {growthOpportunities.map((item) => (
              <Link key={item.title} href="/workbench" className="rounded-xl border border-white/10 bg-white/[0.05] p-4 transition hover:border-brand/45">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-white">{locale === "en" ? item.titleEn : item.title}</h2>
                    <p className="mt-1 text-xs leading-5 text-white/58">{locale === "en" ? item.detailEn : item.detail}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-brand/15 px-2 py-1 text-[11px] font-bold text-brand">{item.impact}</span>
                </div>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand">
                  {locale === "en" ? item.actionEn : item.action} <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </Panel>
      </section>

      <Panel className="p-5 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-fg">{copy.channelsTitle}</h2>
            <p className="mt-1 text-sm text-fg-muted">
              {locale === "en" ? "Only the channels that most affect this week’s go-to-market work." : "只显示本周最影响出海获客的渠道。"}
            </p>
          </div>
          <MessageSquareText className="h-5 w-5 text-brand" />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {priorityPlatforms.map((platform) => {
            const healthy = platform.status === "healthy";
            const tone = healthy ? "success" : platform.status === "attention" ? "warn" : "risk";
            return (
              <Link key={platform.id} href={platform.href} className="panel-inset p-4 transition hover:border-brand/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-brand">
                      <platform.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-bold text-fg">{platform.name}</h3>
                      <p className="text-xs font-semibold text-fg-muted">{platform.region}</p>
                    </div>
                  </div>
                  <Tag tone={tone}>{platform.coverage}%</Tag>
                </div>
                <div className="mt-4 grid gap-2 text-sm">
                  <InfoRow label={copy.channelLabels.reach} value={platform.sevenDayReach} />
                  <InfoRow label={copy.channelLabels.gap} value={locale === "en" ? platform.conversionSignalEn : platform.conversionSignal} />
                  <InfoRow label={copy.channelLabels.action} value={locale === "en" ? personalPlatformActions[platform.id].en : personalPlatformActions[platform.id].zh} />
                </div>
              </Link>
            );
          })}
        </div>
      </Panel>
    </motion.div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  detail: string;
  tone: "brand" | "success" | "risk";
}) {
  const toneClass = {
    brand: "bg-brand/15 text-brand",
    success: "bg-positive/15 text-positive",
    risk: "bg-risk/15 text-risk"
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[56px_1fr] gap-2 border-t border-hairline pt-2 first:border-t-0 first:pt-0">
      <span className="text-xs font-bold text-fg-muted">{label}</span>
      <span className="text-xs font-semibold leading-5 text-fg">{value}</span>
    </div>
  );
}
