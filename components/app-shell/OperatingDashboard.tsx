"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FileStack,
  Globe2,
  Layers,
  Sparkles,
  WandSparkles
} from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import type { ContentKit } from "@/lib/content-schema";
import { getGoal } from "@/lib/goals";
import { getPlatform } from "@/lib/platforms";
import type { PlatformId } from "@/lib/platforms";
import { useLocale } from "@/hooks/useLocale";

type Entitlement = {
  authenticated: boolean;
  plan: string;
  monthlyLimit?: number;
  used?: number;
};

export function OperatingDashboard() {
  const locale = useLocale();
  const [kits, setKits] = useState<ContentKit[]>([]);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
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
          const res = await fetch("/api/kits", { cache: "no-store" });
          const data = (await res.json()) as { kits?: ContentKit[] };
          if (!cancelled) setKits(data.kits ?? []);
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
    platformsLabel: "platforms",
    outputsLabel: "outputs"
  } : {
    eyebrow: "Finfold 仪表板",
    title: "你的内容运营总览",
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
    platformsLabel: "个平台",
    outputsLabel: "条内容"
  };

  // ── Derived real metrics ──────────────────────────────────────────
  const totalKits = kits.length;
  const used = entitlement?.used ?? 0;
  const monthlyLimit = entitlement?.monthlyLimit ?? 0;

  const platformCounts = new Map<PlatformId, number>();
  for (const kit of kits) {
    for (const output of kit.outputs) {
      platformCounts.set(output.platform, (platformCounts.get(output.platform) ?? 0) + 1);
    }
  }
  const coveredPlatforms = [...platformCounts.entries()].sort((a, b) => b[1] - a[1]);

  const authenticated = entitlement?.authenticated ?? false;
  const hasKits = totalKits > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto grid max-w-[1180px] gap-5 pb-10">
      <Panel className="overflow-hidden p-6 md:p-8">
        <div className="max-w-3xl">
          <p className="eyebrow">{copy.eyebrow}</p>
          <div className="mt-3 mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-brand/15 text-brand">
            <Globe2 className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-black leading-tight text-fg md:text-5xl">
            {copy.title}
          </h1>
        </div>

        {/* Real metrics — only when authenticated */}
        {authenticated ? (
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <Metric
              icon={FileStack}
              label={copy.totalKits}
              value={loading ? "—" : String(totalKits)}
              detail={copy.totalKitsDetail}
              tone="brand"
            />
            <Metric
              icon={CheckCircle2}
              label={copy.thisMonth}
              value={loading ? "—" : monthlyLimit > 0 ? `${used}/${monthlyLimit}` : String(used)}
              detail={copy.thisMonthDetail}
              tone="success"
            />
            <Metric
              icon={Layers}
              label={copy.channels}
              value={loading ? "—" : String(coveredPlatforms.length)}
              detail={copy.channelsDetail}
              tone="neutral"
            />
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/workbench" className="btn-primary">
            {copy.create} <WandSparkles className="h-4 w-4" />
          </Link>
          <Link href="/agents" className="btn-ghost">
            {copy.askAgent} <Bot className="h-4 w-4" />
          </Link>
          <Link href="/packages" className="btn-ghost">
            {copy.saved} <FileStack className="h-4 w-4" />
          </Link>
        </div>
      </Panel>

      {/* Guest prompt */}
      {!loading && !authenticated ? (
        <Panel className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/15 text-brand">
            <Sparkles className="h-6 w-6" />
          </span>
          <h2 className="text-lg font-black text-fg">{copy.guestTitle}</h2>
          <p className="max-w-md text-sm leading-6 text-fg-muted">{copy.guestBody}</p>
          <Link href="/workbench" className="btn-primary mt-1">
            {copy.guestCta} <ArrowRight className="h-4 w-4" />
          </Link>
        </Panel>
      ) : null}

      {/* Authenticated: real recent kits + channel coverage */}
      {!loading && authenticated ? (
        hasKits ? (
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* Recent kits */}
            <Panel className="p-5 md:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-fg">{copy.recentTitle}</h2>
                  <p className="mt-1 text-sm text-fg-muted">{copy.recentDetail}</p>
                </div>
                <Link href="/packages" className="shrink-0 text-xs font-bold text-brand hover:underline">
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
                      className="panel-inset p-4 transition hover:border-brand/40"
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
                              <platform.icon className="h-3 w-3" />
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
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-brand">
                            <platform.icon className="h-4 w-4" />
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
                        <div className="h-full rounded-full bg-brand" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </section>
        ) : (
          // Authenticated but no kits yet
          <Panel className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/15 text-brand">
              <Sparkles className="h-6 w-6" />
            </span>
            <h2 className="text-lg font-black text-fg">{copy.emptyTitle}</h2>
            <p className="max-w-md text-sm leading-6 text-fg-muted">{copy.emptyBody}</p>
            <Link href="/workbench" className="btn-primary mt-1">
              {copy.emptyCta} <ArrowRight className="h-4 w-4" />
            </Link>
          </Panel>
        )
      ) : null}
    </motion.div>
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
    brand: "bg-brand/15 text-brand",
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
