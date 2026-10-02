"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  Check,
  Copy,
  CreditCard,
  FlaskConical,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  Users
} from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { SeedCohortPanel } from "@/components/app-shell/SeedCohortPanel";
import { useLocale } from "@/hooks/useLocale";
import type { FounderEvidence } from "@/lib/founder-evidence";

const REASON_LABELS: Record<string, { zh: string; en: string }> = {
  generic: { zh: "内容太泛", en: "Too generic" },
  off_brand: { zh: "偏离品牌", en: "Off brand" },
  weak_hook: { zh: "开头太弱", en: "Weak hook" },
  platform_fit: { zh: "平台适配不足", en: "Poor platform fit" },
  inaccurate: { zh: "内容不准确", en: "Inaccurate" },
  weak_cta: { zh: "CTA 太弱", en: "Weak CTA" }
};

export function FounderEvidenceDashboard() {
  const locale = useLocale();
  const [evidence, setEvidence] = useState<FounderEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/founder/evidence", { cache: "no-store" });
      const data = (await response.json()) as { evidence?: FounderEvidence; error?: string };
      if (!response.ok || !data.evidence) throw new Error(data.error ?? (locale === "en" ? "Failed to load evidence." : "暂时无法加载证据。"));
      setEvidence(data.evidence);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (locale === "en" ? "Failed to load evidence." : "暂时无法加载证据。"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const brief = useMemo(() => evidence ? buildEvidenceBrief(evidence, locale) : "", [evidence, locale]);

  async function copyBrief() {
    await navigator.clipboard.writeText(brief);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (loading) {
    return (
      <Panel className="mx-auto flex min-h-[520px] max-w-[1180px] items-center justify-center p-8">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-brand" />
          <p className="mt-3 text-sm font-semibold text-fg-muted">{locale === "en" ? "Building the evidence view…" : "正在汇总真实产品证据…"}</p>
        </div>
      </Panel>
    );
  }

  if (error || !evidence) {
    return (
      <Panel className="mx-auto max-w-[900px] p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-risk" />
        <h1 className="mt-3 text-xl font-black text-fg">{locale === "en" ? "Evidence view unavailable" : "运营证据暂时不可用"}</h1>
        <p className="mt-2 text-sm text-fg-muted">{error}</p>
        <button type="button" onClick={() => void load()} className="btn-primary mt-5">
          <RefreshCw className="h-4 w-4" /> {locale === "en" ? "Try again" : "重新加载"}
        </button>
      </Panel>
    );
  }

  const maxCohort = Math.max(1, ...evidence.cohorts.map((cohort) => cohort.signedUp));
  const lift = evidence.flywheel.experiment.liftPercent;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mx-auto grid max-w-[1180px] gap-5 pb-10 xl:max-w-[1440px] 2xl:max-w-[1640px]">
      <Panel className="relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand/15 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-brand">
              <Activity className="h-4 w-4" />
              <p className="eyebrow">{locale === "en" ? "Founder evidence room · private" : "创始人证据室 · 私有"}</p>
            </div>
            <h1 className="mt-3 max-w-4xl text-balance text-3xl font-black leading-tight text-fg md:text-5xl">
              {locale === "en" ? "Turn product activity into defensible proof." : "把产品进度，变成经得起追问的证据。"}
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-fg-muted md:text-base">
              {locale === "en"
                ? "One source of truth for seed-user traction, commercialization, and whether Finfold's learning loop is creating measurable value."
                : "统一汇总种子用户进展、商业化转化和数据飞轮效果，所有数字都来自真实产品行为。"}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => void copyBrief()} className="btn-primary">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? (locale === "en" ? "Copied" : "已复制") : locale === "en" ? "Copy evidence brief" : "复制证据摘要"}
            </button>
            <button type="button" onClick={() => void load()} className="btn-ghost" aria-label={locale === "en" ? "Refresh" : "刷新"}>
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="relative mt-5 text-[11px] font-medium text-fg-muted">
          {locale === "en" ? "As of" : "数据截至"} {new Date(evidence.asOf).toLocaleString(locale === "en" ? "en-US" : "zh-CN")}
        </p>
      </Panel>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <EvidenceMetric icon={Users} label={locale === "en" ? "Registered users" : "注册用户"} value={evidence.acquisition.totalUsers} detail={`${evidence.acquisition.newUsers7d} ${locale === "en" ? "new in 7d" : "近 7 日新增"}`} />
        <EvidenceMetric icon={Sparkles} label={locale === "en" ? "Activation rate" : "激活率"} value={`${evidence.acquisition.activationRate}%`} detail={`${evidence.acquisition.activatedUsers} ${locale === "en" ? "created a kit" : "人生成过内容包"}`} tone="brand" />
        <EvidenceMetric icon={Target} label={locale === "en" ? "Closed-loop users" : "完成数据闭环用户"} value={evidence.funnel[3].value} detail={`${evidence.product.measuredKits} ${locale === "en" ? "measured kits" : "个内容包回流表现"}`} tone="success" />
        <EvidenceMetric icon={CreditCard} label={locale === "en" ? "Paid / founding" : "付费 / 创始会员"} value={evidence.commercial.paidAccounts} detail={`${evidence.commercial.paidConversionRate}% ${locale === "en" ? "conversion" : "注册转化"}`} tone="warm" />
      </section>

      <Panel className="p-5 md:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="eyebrow">{locale === "en" ? "Referral growth loop" : "邀请裂变漏斗"}</p>
            <h2 className="mt-2 text-xl font-black text-fg">
              {locale === "en" ? "Are invites becoming activated creators?" : "邀请是否正在变成有效创作者？"}
            </h2>
          </div>
          <p className="text-xs font-semibold text-fg-muted">
            {locale === "en"
              ? `${evidence.referrals.rewardCreditsGranted} Credits granted`
              : `累计发放 ${evidence.referrals.rewardCreditsGranted} 创作点数`}
          </p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <CompactStat label={locale === "en" ? "Attributed signups" : "邀请注册"} value={evidence.referrals.attributed} />
          <CompactStat label={locale === "en" ? "Activated" : "有效创作者"} value={evidence.referrals.completed} />
          <CompactStat label={locale === "en" ? "Activation rate" : "邀请激活率"} value={`${evidence.referrals.activationRate}%`} />
          <CompactStat label={locale === "en" ? "Per referrer" : "每位分享者激活"} value={evidence.referrals.completedPerReferrer} />
          <CompactStat label={locale === "en" ? "Risk flagged" : "风险标记"} value={evidence.referrals.riskFlagged} />
        </div>
      </Panel>

      <SeedCohortPanel locale={locale} cohorts={evidence.seedCohorts} totals={evidence.seedCohortTotals} onCreated={() => void load()} />

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <Panel className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">{locale === "en" ? "Seed-user funnel" : "种子用户漏斗"}</p>
              <h2 className="mt-2 text-2xl font-black text-fg">{locale === "en" ? "From signup to measurable value" : "从注册到可衡量价值"}</h2>
            </div>
            <ArrowRight className="mt-2 h-5 w-5 text-brand" />
          </div>
          <div className="mt-6 grid gap-3">
            {evidence.funnel.map((stage, index) => (
              <div key={stage.key} className="grid grid-cols-[34px_minmax(0,1fr)_70px] items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-surface-2 text-xs font-black text-fg">{index + 1}</span>
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-bold text-fg">{funnelLabel(stage.key, locale)}</p>
                    <p className="text-[11px] font-semibold text-fg-muted">{stage.fromPreviousRate}%</p>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.max(stage.fromSignupRate, stage.value > 0 ? 3 : 0)}%` }} />
                  </div>
                </div>
                <p className="text-right text-2xl font-black tabular-nums text-fg">{stage.value}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-5 md:p-6">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-brand" />
            <h2 className="text-xl font-black text-fg">{locale === "en" ? "Learning loop health" : "数据飞轮健康度"}</h2>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <CompactStat label={locale === "en" ? "Feedback signals" : "显性反馈"} value={evidence.flywheel.feedbackSignals} />
            <CompactStat label={locale === "en" ? "Helpful rate" : "正向反馈率"} value={`${evidence.flywheel.helpfulRate}%`} />
            <CompactStat label={locale === "en" ? "Learning coverage" : "学习覆盖率"} value={`${evidence.flywheel.learningCoverage}%`} />
            <CompactStat label={locale === "en" ? "Edited outputs" : "用户编辑内容"} value={evidence.product.editedOutputs} />
          </div>
          <div className="mt-4 rounded-xl border border-hairline bg-surface-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-brand" />
                <p className="text-xs font-bold text-fg">{locale === "en" ? "Backflow experiment" : "表现回流实验"}</p>
              </div>
              <span className={`tag ${lift !== null && lift > 0 ? "tag-success" : "tag-neutral"}`}>
                {lift === null ? (locale === "en" ? `Need ${evidence.flywheel.experiment.minimumSamplesPerGroup}/group` : `每组需 ${evidence.flywheel.experiment.minimumSamplesPerGroup} 条`) : `${lift > 0 ? "+" : ""}${lift}%`}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div><p className="text-fg-muted">Treatment</p><p className="mt-1 font-black text-fg">{evidence.flywheel.experiment.treatment.averageScore} · n={evidence.flywheel.experiment.treatment.samples}</p></div>
              <div><p className="text-fg-muted">Control</p><p className="mt-1 font-black text-fg">{evidence.flywheel.experiment.control.averageScore} · n={evidence.flywheel.experiment.control.samples}</p></div>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="p-5 md:p-6">
          <div>
            <p className="eyebrow">{locale === "en" ? "8-week cohort view" : "近 8 周 Cohort"}</p>
            <h2 className="mt-2 text-xl font-black text-fg">{locale === "en" ? "Are new users reaching first value?" : "新用户是否真正到达首次价值？"}</h2>
          </div>
          <div className="mt-6 flex h-48 items-end gap-2 sm:gap-3">
            {evidence.cohorts.map((cohort) => (
              <div key={cohort.week} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <p className="text-[10px] font-bold text-fg-muted">{cohort.activationRate}%</p>
                <div className="relative flex h-32 w-full items-end overflow-hidden rounded-t-lg bg-surface-2">
                  <div className="w-full bg-brand/25" style={{ height: `${Math.max(4, (cohort.signedUp / maxCohort) * 100)}%` }}>
                    <div className="w-full bg-brand" style={{ height: `${cohort.signedUp > 0 ? (cohort.activated / cohort.signedUp) * 100 : 0}%` }} />
                  </div>
                </div>
                <p className="truncate text-[9px] font-semibold text-fg-muted">{cohort.week.slice(5)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-[11px] text-fg-muted">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand/25" />{locale === "en" ? "Signed up" : "注册"}</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-brand" />{locale === "en" ? "Activated" : "激活"}</span>
          </div>
        </Panel>

        <Panel className="p-5 md:p-6">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-brand" />
            <h2 className="text-xl font-black text-fg">{locale === "en" ? "Next evidence gaps" : "下一步证据缺口"}</h2>
          </div>
          <div className="mt-5 grid gap-2.5">
            <EvidenceGap
              urgent={evidence.product.pendingMeasurement > 0}
              title={locale === "en" ? `${evidence.product.pendingMeasurement} published outputs need metrics` : `${evidence.product.pendingMeasurement} 条已发布内容等待表现回流`}
              body={locale === "en" ? "Close these loops before increasing generation volume." : "先闭合这些循环，再扩大生成量。"}
            />
            <EvidenceGap
              urgent={evidence.acquisition.repeatCreatorRate < 30}
              title={locale === "en" ? `Repeat creator rate: ${evidence.acquisition.repeatCreatorRate}%` : `重复创作率：${evidence.acquisition.repeatCreatorRate}%`}
              body={locale === "en" ? "Watch whether users return in a second week." : "重点观察用户是否会在第二周再次使用。"}
            />
            <EvidenceGap
              urgent={lift === null}
              title={lift === null ? (locale === "en" ? `Flywheel diagnostic needs ${evidence.flywheel.experiment.minimumSamplesPerGroup} kits per group` : `飞轮内部诊断每组至少需要 ${evidence.flywheel.experiment.minimumSamplesPerGroup} 个内容包`) : (locale === "en" ? `Internal diagnostic difference: ${lift}%` : `内部诊断差异：${lift}%`)}
              body={locale === "en" ? "This unnormalized score is an internal signal, not an external growth-lift claim." : "该分数尚未归一化，只用于内部诊断，不能作为对外增长提升结论。"}
            />
          </div>
          {evidence.flywheel.topNegativeReasons.length > 0 ? (
            <div className="mt-5 border-t border-hairline pt-4">
              <p className="text-xs font-bold text-fg">{locale === "en" ? "Most common quality gaps" : "最常见质量问题"}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {evidence.flywheel.topNegativeReasons.map((item) => (
                  <span key={item.reason} className="tag tag-neutral">{REASON_LABELS[item.reason]?.[locale] ?? item.reason} · {item.count}</span>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>
      </section>
    </motion.div>
  );
}

function EvidenceMetric({ icon: Icon, label, value, detail, tone = "neutral" }: { icon: typeof Users; label: string; value: string | number; detail: string; tone?: "neutral" | "brand" | "success" | "warm" }) {
  const toneClass = { neutral: "bg-surface-2 text-fg", brand: "bg-brand/12 text-brand", success: "bg-positive/12 text-positive", warm: "bg-warn/12 text-warn" }[tone];
  return (
    <Panel className="p-5">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClass}`}><Icon className="h-4 w-4" /></span>
      <p className="mt-4 text-xs font-bold text-fg-muted">{label}</p>
      <p className="mt-1 text-3xl font-black tabular-nums text-fg">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-fg-muted">{detail}</p>
    </Panel>
  );
}

function CompactStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-hairline bg-surface-2 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-fg-muted">{label}</p><p className="mt-1 text-xl font-black tabular-nums text-fg">{value}</p></div>;
}

function EvidenceGap({ urgent, title, body }: { urgent: boolean; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-2 p-3.5">
      <div className="flex items-start gap-2.5">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${urgent ? "bg-warn" : "bg-positive"}`} />
        <div><p className="text-sm font-bold text-fg">{title}</p><p className="mt-1 text-xs leading-5 text-fg-muted">{body}</p></div>
      </div>
    </div>
  );
}

function funnelLabel(key: string, locale: "zh" | "en") {
  const labels: Record<string, { zh: string; en: string }> = {
    signed_up: { zh: "完成注册", en: "Signed up" },
    activated: { zh: "生成首个内容包", en: "Created first kit" },
    published: { zh: "发布至少一条内容", en: "Published an output" },
    measured: { zh: "完成表现回流", en: "Closed a data loop" },
    paid_measured: { zh: "付费且完成增长闭环", en: "Paid with closed loop" }
  };
  return labels[key]?.[locale] ?? key;
}

function buildEvidenceBrief(evidence: FounderEvidence, locale: "zh" | "en") {
  const lift = evidence.flywheel.experiment.liftPercent;
  if (locale === "en") {
    return [
      `Finfold product evidence — ${new Date(evidence.asOf).toISOString().slice(0, 10)}`,
      `Users: ${evidence.acquisition.totalUsers} registered; ${evidence.acquisition.activatedUsers} activated (${evidence.acquisition.activationRate}%); ${evidence.acquisition.weeklyActiveCreators} weekly active creators.`,
      `Product usage: ${evidence.product.totalKits} content kits; ${evidence.product.publishedOutputs} published outputs; ${evidence.product.measuredKits} kits with performance backflow.`,
      `Commercialization: ${evidence.commercial.paidAccounts} paid/founding accounts (${evidence.commercial.paidConversionRate}% of registrations).`,
      `Referrals: ${evidence.referrals.attributed} attributed signups; ${evidence.referrals.completed} activated (${evidence.referrals.activationRate}%); ${evidence.referrals.rewardCreditsGranted} Credits granted.`,
      `Seed cohort: ${evidence.seedCohortTotals.invited} invited codes; ${evidence.seedCohortTotals.redeemed} redeemed; ${evidence.seedCohortTotals.activated} activated; ${evidence.seedCohortTotals.measured} closed loops.`,
      `Data flywheel: ${evidence.flywheel.feedbackSignals} explicit feedback signals; ${evidence.flywheel.learningCoverage}% of activated users have private learned memory; ${lift === null ? "internal diagnostic still needs treatment/control kits" : `${lift}% internal diagnostic difference vs. control (not an external lift claim)`}.`
    ].join("\n");
  }
  return [
    `Finfold 产品进展证据 — ${new Date(evidence.asOf).toISOString().slice(0, 10)}`,
    `用户：累计注册 ${evidence.acquisition.totalUsers} 人；激活 ${evidence.acquisition.activatedUsers} 人（${evidence.acquisition.activationRate}%）；周活跃创作者 ${evidence.acquisition.weeklyActiveCreators} 人。`,
    `产品使用：累计生成 ${evidence.product.totalKits} 个内容包；发布 ${evidence.product.publishedOutputs} 条内容；${evidence.product.measuredKits} 个内容包已完成表现回流。`,
    `商业化：付费/创始会员 ${evidence.commercial.paidAccounts} 个，注册付费转化率 ${evidence.commercial.paidConversionRate}%。`,
    `邀请裂变：归因注册 ${evidence.referrals.attributed} 人，激活 ${evidence.referrals.completed} 人（${evidence.referrals.activationRate}%），累计发放 ${evidence.referrals.rewardCreditsGranted} 创作点数。`,
    `种子批次：发放 ${evidence.seedCohortTotals.invited} 个体验码，兑换 ${evidence.seedCohortTotals.redeemed} 个，激活 ${evidence.seedCohortTotals.activated} 人，完成回流 ${evidence.seedCohortTotals.measured} 人。`,
    `数据飞轮：累计 ${evidence.flywheel.feedbackSignals} 条显性反馈；${evidence.flywheel.learningCoverage}% 的激活用户已形成私有学习记忆；${lift === null ? "内部诊断仍需积累实验组/对照组内容包" : `实验组相较对照组的内部诊断差异为 ${lift}%（不可作为对外提升结论）`}。`
  ].join("\n");
}
