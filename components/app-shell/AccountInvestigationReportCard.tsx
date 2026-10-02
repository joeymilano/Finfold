"use client";

import React from "react";
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Target,
  TriangleAlert,
  WandSparkles
} from "@/components/ui/icons";
import {
  buildAccountHealthMatrix,
  type AccountHealthStatus,
  type AccountInvestigation,
  type AccountWorkbenchAction
} from "@/lib/agent/account-investigation";

type Props = {
  investigation: AccountInvestigation;
  locale: "zh" | "en";
  onAskAgent?: (prompt: string) => void;
  variant?: "dark" | "surface";
  compact?: boolean;
};

const stateLabels: Record<AccountInvestigation["report"]["caseState"], { zh: string; en: string }> = {
  healthy_or_normal_variance: { zh: "暂未发现异常", en: "No abnormality found" },
  low_reach: { zh: "阅读偏低", en: "Low reach" },
  suspected_visibility_restriction: { zh: "分发异常待验证", en: "Distribution issue to verify" },
  confirmed_enforcement: { zh: "已确认平台限制", en: "Platform enforcement confirmed" },
  account_suspended: { zh: "账号已被封禁", en: "Account suspended" },
  profile_unavailable: { zh: "公开主页不可用", en: "Public profile unavailable" },
  insufficient_evidence: { zh: "证据不足", en: "Insufficient evidence" }
};

const evidenceLabels = {
  link_only: { zh: "仅账号链接", en: "Link only" },
  public_profile: { zh: "公开主页", en: "Public profile" },
  content_sample: { zh: "Post 原文", en: "Post sample" },
  creator_analytics: { zh: "账号后台数据", en: "Creator analytics" },
  platform_notice: { zh: "平台通知", en: "Platform notice" }
} as const;

const healthLabels = {
  presence: { zh: "公开可见性", en: "Public presence", icon: Eye },
  distribution: { zh: "推荐分发", en: "Distribution", icon: Radar },
  conversion: { zh: "内容转化", en: "Conversion", icon: BarChart3 },
  policy: { zh: "账号与合规", en: "Policy health", icon: ShieldCheck }
} as const;

const sourceLabels = {
  public_profile: { zh: "公开主页", en: "Public profile" },
  creator_analytics: { zh: "后台数据", en: "Analytics" },
  platform_notice: { zh: "平台通知", en: "Platform notice" },
  screenshot: { zh: "截图", en: "Screenshot" },
  user_report: { zh: "用户陈述", en: "User report" }
} as const;

export function AccountInvestigationReportCard({
  investigation,
  locale,
  onAskAgent,
  variant = "surface",
  compact = false
}: Props) {
  const { report, browserHandoff } = investigation;
  const legacySafe = investigation as AccountInvestigation & {
    reportId?: string;
    reportVersion?: string;
    generatedAt?: string;
    report: AccountInvestigation["report"] & { workbenchPlan?: AccountInvestigation["report"]["workbenchPlan"] };
  };
  const workbenchPlan = legacySafe.report.workbenchPlan ?? {
    strategy: locale === "zh"
      ? "旧报告没有改稿方案。"
      : "This historical report has no executable prescriptions. Ask Agent to create a new Workbench plan from it.",
    actions: []
  };
  const actionPlan = report.actionPlan ?? {
    now: report.recoveryPlan.next24Hours.slice(0, 3),
    nextPost: report.recoveryPlan.next7Days.slice(0, 3),
    verify: report.recheckCriteria.slice(0, 3)
  };
  const dark = variant === "dark";
  const zh = locale === "zh";
  const highRisk = report.caseState === "confirmed_enforcement" || report.caseState === "account_suspended";
  const health = buildAccountHealthMatrix(investigation, locale);
  const generatedAt = formatGeneratedAt(legacySafe.generatedAt ?? investigation.publicEvidence.capturedAt, locale);
  const confidence = report.confidence === "high"
    ? (zh ? "高置信" : "High confidence")
    : report.confidence === "medium"
      ? (zh ? "中置信" : "Medium confidence")
      : (zh ? "低置信" : "Low confidence");
  const platform = investigation.platform === "xiaohongshu"
    ? (zh ? "小红书" : "Xiaohongshu")
    : investigation.platform === "reddit"
      ? "Reddit"
      : investigation.platform === "linkedin"
        ? "LinkedIn"
        : "X / Twitter";
  const shell = dark
    ? "border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] text-white shadow-[0_18px_60px_rgba(0,0,0,0.28)]"
    : "border-hairline bg-surface text-fg shadow-panel";
  const muted = dark ? "text-white/52" : "text-fg-muted";
  const subtle = dark ? "text-white/38" : "text-fg-subtle";
  const inset = dark ? "border-white/10 bg-black/18" : "border-hairline bg-surface-2/55";

  return (
    <article className={`relative mt-3 overflow-hidden rounded-2xl border ${shell}`} aria-label={zh ? "账号体检报告" : "Account diagnosis"}>
      <div className={`h-1 w-full ${highRisk ? "bg-risk" : "bg-[linear-gradient(90deg,rgb(var(--action)),rgb(var(--positive)))]"}`} />
      <header className={compact ? "p-4" : "p-4 sm:p-5"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${highRisk ? "border-risk/30 bg-risk/[0.1] text-risk" : "border-action/25 bg-action/[0.1] text-action"}`}>
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${subtle}`}>
                {zh ? "FINFOLD · 账号体检" : "FINFOLD · ACCOUNT CHECK"}
              </p>
              <p className={`mt-1 truncate font-mono text-[10px] ${subtle}`}>
                {legacySafe.reportId ?? "FF-LEGACY-REPORT"} · v{legacySafe.reportVersion ?? "1.0"}
              </p>
            </div>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${highRisk ? "border-risk/30 bg-risk/[0.08] text-risk" : "border-action/30 bg-action/[0.08] text-action"}`}>
            {stateLabels[report.caseState][locale]}
          </span>
        </div>

        <h3 className={`mt-5 text-pretty font-black leading-tight tracking-tight ${compact ? "text-lg" : "text-xl sm:text-2xl"}`}>
          {report.headline}
        </h3>
        <p className={`mt-2 text-pretty text-xs leading-5 ${muted}`}>{report.executiveSummary}</p>

        <div className={`mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-4 ${dark ? "border-white/10 bg-white/10" : "border-hairline bg-hairline"}`}>
          {[
            [zh ? "平台" : "Platform", platform],
            [zh ? "证据" : "Evidence", evidenceLabels[investigation.evidenceLevel][locale]],
            [zh ? "把握" : "Confidence", confidence],
            [zh ? "时间" : "Generated", generatedAt]
          ].map(([label, value]) => (
            <div key={label} className={dark ? "bg-[#111315] px-3 py-2.5" : "bg-surface px-3 py-2.5"}>
              <p className={`text-[9px] font-bold uppercase tracking-wider ${subtle}`}>{label}</p>
              <p className="mt-1 text-[11px] font-bold leading-4">{value}</p>
            </div>
          ))}
        </div>
      </header>

      <section className={`border-t px-4 py-4 sm:px-5 ${dark ? "border-white/10" : "border-hairline"}`}>
        <SectionTitle icon={Target} title={zh ? "账号四项" : "Four checks"} dark={dark} />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {health.map((item) => {
            const definition = healthLabels[item.key];
            const Icon = definition.icon;
            return (
              <div key={item.key} className={`rounded-xl border p-3 ${inset}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[11px] font-bold">
                    <Icon className="h-3.5 w-3.5 text-action" />
                    {definition[locale]}
                  </span>
                  <HealthStatus status={item.status} locale={locale} />
                </div>
                <p className={`mt-2 text-[10px] leading-4 ${muted}`}>{item.finding}</p>
              </div>
            );
          })}
        </div>
        <p className={`mt-2 text-[10px] leading-4 ${subtle}`}>{report.confidenceReason}</p>
      </section>

      {report.hypotheses.length > 0 ? (
        <section className={`border-t px-4 py-4 sm:px-5 ${dark ? "border-white/10" : "border-hairline"}`}>
          <SectionTitle icon={Radar} title={zh ? "先查什么" : "Check first"} dark={dark} />
          <div className="mt-3 space-y-2">
            {report.hypotheses.slice(0, 4).map((item, index) => (
              <div key={`${item.category}-${item.cause}`} className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-[2rem_1fr] ${inset}`}>
                <span className={`font-mono text-xs font-black ${item.likelihood === "high" ? "text-risk" : item.likelihood === "medium" ? "text-warn" : subtle}`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold">{item.cause}</p>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${dark ? "border-white/10 text-white/42" : "border-hairline text-fg-subtle"}`}>
                      {likelihoodLabel(item.likelihood, locale)}
                    </span>
                  </div>
                  <p className={`mt-1 text-[10px] leading-4 ${muted}`}>{item.why}</p>
                  <p className="mt-1.5 text-[10px] font-semibold leading-4 text-action">
                    {zh ? "怎么验：" : "Verify: "}{item.verifyNext}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {(report.contentRisks ?? []).length > 0 ? (
        <section className={`border-t px-4 py-4 sm:px-5 ${dark ? "border-white/10" : "border-hairline"}`}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <SectionTitle icon={ShieldAlert} title={zh ? "Post 风险词" : "Post risk scan"} dark={dark} />
            <span className={`text-[9px] font-bold uppercase tracking-wider ${subtle}`}>
              {zh ? "看语境，不看黑名单" : "Context, not a blacklist"}
            </span>
          </div>
          <p className={`mt-2 text-[10px] leading-4 ${muted}`}>
            {zh
              ? "命中不等于限流，只说明这句话值得改。"
              : "Finfold flags wording that may trigger review, lower content-quality signals, or conflict with community rules. A match does not prove account restriction."}
          </p>
          <div className="mt-3 space-y-2.5">
            {(report.contentRisks ?? []).slice(0, 8).map((item, index) => (
              <div key={`${item.postIndex}-${item.excerpt}-${index}`} className={`rounded-xl border p-3.5 ${item.severity === "high" ? "border-risk/25 bg-risk/[0.045]" : inset}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-current/15 bg-current/[0.04] px-2 py-0.5 font-mono text-[9px] font-black uppercase text-fg-muted">
                    Post {item.postIndex}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${item.severity === "high" ? "bg-risk/10 text-risk" : item.severity === "medium" ? "bg-warn/10 text-warn" : "bg-action/10 text-action"}`}>
                    {riskSeverityLabel(item.severity, locale)}
                  </span>
                  <span className={`text-[9px] font-bold ${item.status === "confirmed" ? "text-risk" : item.status === "supported" ? "text-warn" : subtle}`}>
                    {riskStatusLabel(item.status, locale)}
                  </span>
                </div>
                <blockquote className={`mt-2 border-l-2 border-risk/45 pl-3 text-xs font-black leading-5 ${dark ? "text-white/88" : "text-fg"}`}>
                  “{item.excerpt}”
                </blockquote>
                <p className={`mt-2 text-[10px] leading-4 ${muted}`}>{item.why}</p>
                <p className={`mt-1 text-[10px] leading-4 ${subtle}`}>{item.platformBasis}</p>
                <div className={`mt-3 rounded-lg border p-3 ${dark ? "border-positive/20 bg-positive/[0.045]" : "border-positive/20 bg-positive/[0.05]"}`}>
                  <p className="text-[9px] font-black uppercase tracking-wider text-positive">{zh ? "换成" : "Rewrite"}</p>
                  <p className={`mt-1 text-[11px] font-semibold leading-5 ${dark ? "text-white/78" : "text-fg"}`}>{item.saferRewrite}</p>
                </div>
                <p className="mt-2 text-[10px] font-semibold leading-4 text-action">
                  {zh ? "验证：" : "Verify: "}{item.verifyNext}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={`border-t px-4 py-4 sm:px-5 ${dark ? "border-white/10" : "border-hairline"}`}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <SectionTitle icon={WandSparkles} title={zh ? "直接去改" : "Fix in Workbench"} dark={dark} />
          <span className={`text-[9px] font-bold uppercase tracking-wider ${subtle}`}>
            {zh ? "先确认，不会直接发" : "Confirm first · Never auto-publishes"}
          </span>
        </div>
        <p className={`mt-2 text-[11px] leading-5 ${muted}`}>{workbenchPlan.strategy}</p>
        {workbenchPlan.actions.length > 0 ? (
          <div className="mt-3 space-y-2.5">
            {workbenchPlan.actions.map((action) => (
              <WorkbenchPrescription
                key={action.id}
                action={action}
                locale={locale}
                dark={dark}
                onAskAgent={onAskAgent}
              />
            ))}
          </div>
        ) : (
          <div className={`mt-3 rounded-xl border border-dashed p-3 text-[11px] leading-5 ${dark ? "border-white/12 text-white/48" : "border-hairline text-fg-muted"}`}>
            {zh ? "证据不够，先补齐再改。" : "Add evidence before changing content."}
          </div>
        )}
      </section>

      <section className={`grid border-t sm:grid-cols-2 ${dark ? "border-white/10" : "border-hairline"}`}>
        <div className={`px-4 py-4 sm:px-5 ${dark ? "sm:border-r sm:border-white/10" : "sm:border-r sm:border-hairline"}`}>
          <SectionTitle icon={ClipboardList} title={zh ? "现在做" : "Do now"} dark={dark} />
          <ol className={`mt-3 space-y-2 text-[10px] leading-4 ${muted}`}>
            {actionPlan.now.map((item, index) => (
              <li key={item} className="flex gap-2">
                <span className="font-mono font-bold text-action">{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
          {actionPlan.nextPost.length > 0 ? (
            <p className={`mt-3 border-l-2 border-action/60 pl-2 text-[10px] leading-4 ${muted}`}>
              <strong className={dark ? "text-white/75" : "text-fg"}>{zh ? "下一篇：" : "Next post: "}</strong>
              {actionPlan.nextPost.join(zh ? "；" : "; ")}
            </p>
          ) : null}
          {actionPlan.verify.length > 0 ? (
            <p className={`mt-3 border-l-2 border-positive/60 pl-2 text-[10px] leading-4 ${muted}`}>
              <strong className={dark ? "text-white/75" : "text-fg"}>{zh ? "怎么验：" : "Verify: "}</strong>
              {actionPlan.verify.join(zh ? "；" : "; ")}
            </p>
          ) : null}
        </div>
        <div className={`border-t px-4 py-4 sm:border-t-0 sm:px-5 ${dark ? "border-white/10" : "border-hairline"}`}>
          <SectionTitle icon={FileText} title={zh ? "证据" : "Evidence"} dark={dark} />
          {report.evidence.length > 0 ? (
            <div className="mt-3 space-y-2">
              {report.evidence.slice(0, 5).map((item, index) => (
                <div key={`${item.finding}-${index}`} className="flex gap-2 text-[10px] leading-4">
                  <EvidenceMark strength={item.strength} />
                  <div>
                    <p className={muted}>{item.finding}</p>
                    <p className={`mt-0.5 font-bold uppercase tracking-wider ${subtle}`}>{sourceLabels[item.source][locale]}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={`mt-3 text-[10px] leading-4 ${muted}`}>{zh ? "还没有硬证据。" : "No hard evidence yet."}</p>
          )}
        </div>
      </section>

      {browserHandoff.required || report.doNotDo.length > 0 || report.recoveryPlan.appeal.needed ? (
        <details className={`group border-t px-4 py-4 sm:px-5 ${dark ? "border-white/10" : "border-hairline"}`}>
          <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <TriangleAlert className={`h-4 w-4 ${highRisk ? "text-risk" : "text-warn"}`} />
              {zh ? "证据、申诉和禁区" : "Evidence, appeal and limits"}
            </span>
            <span className={`text-[10px] ${subtle}`}>{zh ? "查看" : "View"}</span>
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {browserHandoff.required ? (
              <div className={`rounded-xl border p-3 ${inset}`}>
                <p className="text-[10px] font-black uppercase tracking-wider text-warn">{zh ? "还缺后台证据" : "More evidence needed"}</p>
                <p className={`mt-1.5 text-[10px] leading-4 ${muted}`}>{browserHandoff.reason}</p>
                <p className={`mt-2 text-[10px] leading-4 ${dark ? "text-white/72" : "text-fg"}`}>{browserHandoff.captureChecklist.join(zh ? "、" : "; ")}</p>
              </div>
            ) : null}
            {report.doNotDo.length > 0 ? (
              <div className={`rounded-xl border p-3 ${dark ? "border-risk/25 bg-risk/[0.045]" : "border-risk/20 bg-risk/[0.04]"}`}>
                <p className="text-[10px] font-black uppercase tracking-wider text-risk">{zh ? "先别做" : "Don’t do this"}</p>
                <ul className={`mt-1.5 list-disc space-y-1 pl-4 text-[10px] leading-4 ${muted}`}>
                  {report.doNotDo.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
          {report.recoveryPlan.appeal.needed ? (
            <div className={`mt-3 rounded-xl border p-3 ${inset}`}>
              <p className="text-[10px] font-black uppercase tracking-wider text-action">{zh ? "申诉草稿 · 先核对" : "Appeal draft · Review first"}</p>
              <p className={`mt-1 text-[10px] leading-4 ${subtle}`}>{report.recoveryPlan.appeal.officialPath}</p>
              <p className={`mt-2 whitespace-pre-wrap text-[11px] leading-5 ${muted}`}>{report.recoveryPlan.appeal.draft}</p>
            </div>
          ) : null}
        </details>
      ) : null}
    </article>
  );
}

function SectionTitle({ icon: Icon, title, dark }: { icon: typeof Target; title: string; dark: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] ${dark ? "text-white/58" : "text-fg-muted"}`}>
      <Icon className="h-3.5 w-3.5 text-action" />
      {title}
    </div>
  );
}

function HealthStatus({ status, locale }: { status: AccountHealthStatus; locale: "zh" | "en" }) {
  const labels: Record<AccountHealthStatus, { zh: string; en: string; classes: string }> = {
    stable: { zh: "稳定", en: "Stable", classes: "border-positive/25 bg-positive/[0.08] text-positive" },
    watch: { zh: "关注", en: "Watch", classes: "border-warn/25 bg-warn/[0.08] text-warn" },
    critical: { zh: "异常", en: "Critical", classes: "border-risk/25 bg-risk/[0.08] text-risk" },
    unknown: { zh: "未知", en: "Unknown", classes: "border-current/15 bg-current/[0.04] text-fg-muted" }
  };
  const item = labels[status];
  return <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase ${item.classes}`}>{item[locale]}</span>;
}

function WorkbenchPrescription({
  action,
  locale,
  dark,
  onAskAgent
}: {
  action: AccountWorkbenchAction;
  locale: "zh" | "en";
  dark: boolean;
  onAskAgent?: (prompt: string) => void;
}) {
  const zh = locale === "zh";
  const ready = action.readiness === "ready";
  const readiness = action.readiness === "ready"
    ? (zh ? "可执行" : "Ready")
    : action.readiness === "needs_evidence"
      ? (zh ? "等待证据" : "Needs evidence")
      : (zh ? "暂缓执行" : "Blocked");
  return (
    <div className={`rounded-xl border p-3.5 ${ready ? "border-action/25 bg-action/[0.055]" : dark ? "border-white/10 bg-black/16" : "border-hairline bg-surface-2/55"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-action/[0.12] px-2 py-0.5 text-[9px] font-black uppercase text-action">
              {priorityLabel(action.priority, locale)}
            </span>
            <span className={`text-[9px] font-bold uppercase ${ready ? "text-positive" : action.readiness === "blocked" ? "text-risk" : "text-warn"}`}>
              {readiness}
            </span>
          </div>
          <p className="mt-2 text-xs font-black leading-5">{action.title}</p>
          <p className={`mt-1 text-[10px] leading-4 ${dark ? "text-white/52" : "text-fg-muted"}`}>{action.rationale}</p>
        </div>
        {onAskAgent ? (
          <button
            type="button"
            onClick={() => onAskAgent(action.agentPrompt)}
            disabled={!ready}
            className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-action px-3 py-2 text-[10px] font-black text-on-action shadow-sm transition hover:bg-action-strong disabled:cursor-not-allowed disabled:bg-current/10 disabled:text-current/35"
            aria-label={ready ? `${zh ? "让智能体执行" : "Ask Agent to execute"}：${action.title}` : `${action.title}：${readiness}`}
          >
            <WandSparkles className="h-3.5 w-3.5" />
            {ready ? (zh ? "让智能体执行" : "Ask Agent") : readiness}
            {ready ? <ArrowUpRight className="h-3 w-3" /> : null}
          </button>
        ) : null}
      </div>
      <div className={`mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2 ${dark ? "border-white/10" : "border-hairline"}`}>
        <div>
          <p className={`text-[9px] font-bold uppercase tracking-wider ${dark ? "text-white/34" : "text-fg-subtle"}`}>{zh ? "交付物" : "Deliverable"}</p>
          <p className={`mt-1 text-[10px] leading-4 ${dark ? "text-white/68" : "text-fg-muted"}`}>{action.deliverable}</p>
        </div>
        <div>
          <p className={`text-[9px] font-bold uppercase tracking-wider ${dark ? "text-white/34" : "text-fg-subtle"}`}>{zh ? "成功信号" : "Success signal"}</p>
          <p className={`mt-1 text-[10px] leading-4 ${dark ? "text-white/68" : "text-fg-muted"}`}>{action.successSignal}</p>
        </div>
      </div>
    </div>
  );
}

function EvidenceMark({ strength }: { strength: "confirmed" | "strong" | "weak" }) {
  if (strength === "confirmed") return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" />;
  if (strength === "strong") return <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-action" />;
  return <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />;
}

function priorityLabel(priority: AccountWorkbenchAction["priority"], locale: "zh" | "en"): string {
  const labels = {
    now: { zh: "现在", en: "Now" },
    next: { zh: "下一步", en: "Next" },
    later: { zh: "稍后", en: "Later" }
  } as const;
  return labels[priority][locale];
}

function likelihoodLabel(likelihood: "low" | "medium" | "high", locale: "zh" | "en"): string {
  const labels = {
    high: { zh: "高可能", en: "High" },
    medium: { zh: "中可能", en: "Medium" },
    low: { zh: "低可能", en: "Low" }
  } as const;
  return labels[likelihood][locale];
}

function riskSeverityLabel(severity: "low" | "medium" | "high", locale: "zh" | "en"): string {
  const labels = {
    high: { zh: "高风险", en: "High risk" },
    medium: { zh: "中风险", en: "Medium risk" },
    low: { zh: "低风险", en: "Low risk" }
  } as const;
  return labels[severity][locale];
}

function riskStatusLabel(status: "potential" | "supported" | "confirmed", locale: "zh" | "en"): string {
  const labels = {
    potential: { zh: "潜在风险", en: "Potential" },
    supported: { zh: "规则支持", en: "Supported" },
    confirmed: { zh: "通知确认", en: "Confirmed" }
  } as const;
  return labels[status][locale];
}

function formatGeneratedAt(value: string, locale: "zh" | "en"): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return locale === "zh" ? "刚刚" : "Just now";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
