"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Ban,
  BarChart3,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Layers,
  LockKeyhole,
  Radar,
  Shield,
  ShieldAlert,
  TriangleAlert,
  WandSparkles,
  XCircle
} from "@/components/ui/icons";
import { ReportChart } from "@/components/report/ReportChart";
import { focusEvidenceCard } from "@/lib/report/evidence-nav";
import type { EvidencePayload } from "@/lib/report/chart-spec";
import type { AccountInvestigation, AccountInvestigationReport } from "@/lib/agent/account-investigation";

/**
 * ReportRenderer — the v2 diagnostic report (设计方案 §4.1).
 *
 * Renders the cover band, data-source coverage, key findings, ranked causes
 * and the time-layered action plan from the v2 report schema. v1 reports fall
 * back to AccountInvestigationReportCard. Three renderer-side gates protect
 * trust: evidence references that don't resolve to a captured evidence card
 * are dropped, empty charts render an explicit empty state, and a numeric
 * confidence that contradicts its band is not shown.
 */

type ReportRendererProps = {
  investigation: AccountInvestigation;
  locale: "zh" | "en";
  onAskAgent?: (prompt: string) => void;
  evidence?: EvidencePayload[];
  /** Pro entitlement — the evidence appendix and PDF export are Pro features. */
  fullAccess?: boolean;
};

export function isV2Report(report: AccountInvestigationReport): boolean {
  return Boolean(report.dataWindow || report.keyFindings || report.actionPlanV2 || report.dataSourceCoverage);
}

/** Gate 1 — keep only evidence ids that resolve to a captured EvidencePayload. */
export function keepValidEvidenceIds(
  ids: string[] | undefined,
  evidence: EvidencePayload[]
): { kept: string[]; dropped: string[] } {
  if (!ids || ids.length === 0) return { kept: [], dropped: [] };
  const known = new Set(evidence.map((item) => item.id));
  const kept = ids.filter((id) => known.has(id));
  const dropped = ids.filter((id) => !known.has(id));
  if (dropped.length > 0) {
    console.info("[evidence_ref_miss]", JSON.stringify({ dropped }));
  }
  return { kept, dropped };
}

/** Gate 3 — a numeric confidence may only render when it matches its band. */
export function isConfidenceConsistent(score: number | undefined, band: "low" | "medium" | "high"): boolean {
  if (typeof score !== "number" || !Number.isFinite(score)) return false;
  if (band === "high") return score >= 70;
  if (band === "medium") return score >= 40 && score < 70;
  return score < 40;
}

const STATE_LABELS: Record<AccountInvestigationReport["caseState"], { zh: string; en: string }> = {
  healthy_or_normal_variance: { zh: "暂未发现异常", en: "No abnormality found" },
  low_reach: { zh: "阅读偏低", en: "Low reach" },
  suspected_visibility_restriction: { zh: "分发异常待验证", en: "Distribution issue to verify" },
  confirmed_enforcement: { zh: "已确认平台限制", en: "Platform enforcement confirmed" },
  account_suspended: { zh: "账号已被封禁", en: "Account suspended" },
  profile_unavailable: { zh: "公开主页不可用", en: "Public profile unavailable" },
  insufficient_evidence: { zh: "证据不足", en: "Insufficient evidence" }
};

const COVERAGE_SOURCE_LABELS: Record<string, { zh: string; en: string }> = {
  creator_analytics: { zh: "后台数据", en: "Analytics" },
  public_profile: { zh: "公开主页", en: "Public profile" },
  platform_notice: { zh: "平台通知", en: "Platform notice" },
  content_sample: { zh: "内容样本", en: "Post sample" },
  platform_research: { zh: "平台调研", en: "Research" },
  user_report: { zh: "用户陈述", en: "User report" }
};

const COVERAGE_STATUS_LABELS = {
  available: { zh: "已取得", en: "Available", icon: CheckCircle2, classes: "border-positive/25 bg-positive/[0.08] text-positive" },
  partial: { zh: "部分", en: "Partial", icon: TriangleAlert, classes: "border-warn/25 bg-warn/[0.08] text-warn" },
  missing: { zh: "缺失", en: "Missing", icon: XCircle, classes: "border-risk/25 bg-risk/[0.08] text-risk" }
} as const;

const SEVERITY_LABELS = {
  critical: { zh: "高", en: "Critical", classes: "border-risk/25 bg-risk/[0.08] text-risk" },
  warning: { zh: "中", en: "Warning", classes: "border-warn/25 bg-warn/[0.08] text-warn" },
  info: { zh: "说明", en: "Info", classes: "border-action/25 bg-action/[0.08] text-action" }
} as const;

const RISK_SEVERITY_LABELS = {
  high: { zh: "高风险", en: "High", classes: "border-risk/25 bg-risk/[0.08] text-risk" },
  medium: { zh: "中风险", en: "Medium", classes: "border-warn/25 bg-warn/[0.08] text-warn" },
  low: { zh: "低风险", en: "Low", classes: "border-action/25 bg-action/[0.08] text-action" }
} as const;

const RISK_STATUS_LABELS = {
  potential: { zh: "疑似", en: "Potential" },
  supported: { zh: "有依据", en: "Supported" },
  confirmed: { zh: "已确认", en: "Confirmed" }
} as const;

const RISK_CATEGORY_LABELS: Record<string, { zh: string; en: string }> = {
  misleading_claim: { zh: "误导性表述", en: "Misleading claim" },
  spam_or_manipulation: { zh: "垃圾或操纵", en: "Spam / manipulation" },
  prohibited_goods: { zh: "违禁商品", en: "Prohibited goods" },
  harassment: { zh: "骚扰", en: "Harassment" },
  sensitive_content: { zh: "敏感内容", en: "Sensitive content" },
  engagement_bait: { zh: "诱导互动", en: "Engagement bait" },
  off_platform_redirect: { zh: "站外引流", en: "Off-platform redirect" },
  duplicate_or_automation: { zh: "重复或自动化", en: "Duplicate / automation" },
  community_mismatch: { zh: "社区不匹配", en: "Community mismatch" },
  other: { zh: "其他", en: "Other" }
};

export function ReportRenderer({ investigation, locale, onAskAgent, evidence = [], fullAccess = true }: ReportRendererProps) {
  const zh = locale === "zh";
  const articleRef = React.useRef<HTMLElement>(null);
  const { report } = investigation;
  const highRisk = report.caseState === "confirmed_enforcement" || report.caseState === "account_suspended";
  const platform = investigation.platform === "xiaohongshu"
    ? (zh ? "小红书" : "Xiaohongshu")
    : investigation.platform === "reddit"
      ? "Reddit"
      : investigation.platform === "linkedin"
        ? "LinkedIn"
        : "X / Twitter";
  const confidenceScore = isConfidenceConsistent(report.confidenceScore, report.confidence)
    ? report.confidenceScore
    : undefined;
  const confidenceLabel = report.confidence === "high"
    ? (zh ? "高置信" : "High confidence")
    : report.confidence === "medium"
      ? (zh ? "中置信" : "Medium confidence")
      : (zh ? "低置信" : "Low confidence");
  const generatedAt = formatStamp(investigation.generatedAt, locale);
  const rankedHypotheses = rankHypotheses(report);
  const actionWorkbench = new Map((report.workbenchPlan?.actions ?? []).map((action) => [action.id, action]));
  const handleExportPdf = React.useCallback(() => {
    const source = articleRef.current;
    if (!source || typeof document === "undefined") return;
    const clone = source.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("details:not([open])").forEach((node) => {
      if (node instanceof HTMLDetailsElement) node.open = true;
    });
    const mount = document.createElement("div");
    mount.id = "finfold-print-root";
    mount.setAttribute("data-theme", "light");
    mount.appendChild(clone);
    document.body.classList.add("printing-report");
    document.body.appendChild(mount);
    const previousTitle = document.title;
    document.title = `Finfold-${zh ? "诊断" : "Diagnosis"}-${platform}-${investigation.reportId}`;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.title = previousTitle;
      mount.remove();
      document.body.classList.remove("printing-report");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.setTimeout(cleanup, 60_000); // fallback if afterprint never fires
    window.print();
  }, [investigation.reportId, platform, zh]);
  // Metric rows derive from captured evidence only (§4.1 block 3) — the table
  // never shows a number the tools did not return.
  const metricRows = evidence
    .flatMap((item) => item.metrics.map((metric) => ({
      label: (zh ? metric.labelZh : metric.labelEn) ?? (zh ? metric.labelEn : metric.labelZh),
      value: metric.value,
      deltaPct: metric.deltaPct,
      spark: item.chart?.type === "sparkline" ? item.chart : undefined
    })))
    .filter((row) => Boolean(row.label))
    .slice(0, 6);

  return (
    <article
      ref={articleRef}
      data-funfold-report=""
      aria-label={zh ? "账号诊断报告" : "Account diagnosis report"}
      className="relative mt-3 overflow-hidden rounded-2xl border border-hairline bg-surface text-fg shadow-panel"
    >
      <div className={`h-1 w-full ${highRisk ? "bg-risk" : "bg-[linear-gradient(90deg,rgb(var(--action)),rgb(var(--positive)))]"}`} />

      {/* 0 · 封面带 */}
      <header className="px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${highRisk ? "border-risk/30 bg-risk/[0.1] text-risk" : "border-action/25 bg-action/[0.1] text-action"}`}>
              <FileText className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-fg-subtle">
                {zh ? "FINFOLD · 账号诊断" : "FINFOLD · DIAGNOSIS"}
              </p>
              <p className="mt-1 truncate font-mono text-[10px] text-fg-subtle">
                {investigation.reportId} · v{investigation.reportVersion}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {fullAccess ? (
              <button
                type="button"
                onClick={handleExportPdf}
                className="focus-ring no-print inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface px-2 py-1 text-[10px] font-black text-fg-muted transition hover:border-action/40 hover:text-fg"
              >
                <Download className="h-3 w-3" />
                {zh ? "导出 PDF" : "Export PDF"}
              </button>
            ) : null}
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${highRisk ? "border-risk/30 bg-risk/[0.08] text-risk" : "border-action/30 bg-action/[0.08] text-action"}`}>
              {STATE_LABELS[report.caseState][locale]}
            </span>
          </div>
        </div>

        <h3 className="mt-4 text-pretty text-xl font-black leading-tight tracking-tight sm:text-2xl">
          {report.headline}
        </h3>
        <p className="mt-2 text-pretty text-xs leading-5 text-fg-muted">{report.executiveSummary}</p>

        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-4">
          {[
            [zh ? "平台" : "Platform", platform],
            [zh ? "把握" : "Confidence", confidenceScore !== undefined ? `${confidenceLabel} · ${confidenceScore}` : confidenceLabel],
            [zh ? "报告" : "Report", `${investigation.reportId}`],
            [zh ? "时间" : "Generated", generatedAt]
          ].map(([label, value]) => (
            <div key={label} className="bg-surface px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-fg-subtle">{label}</p>
              <p className="mt-1 truncate text-[11px] font-bold leading-4">{value}</p>
            </div>
          ))}
        </div>

        {report.dataWindow ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-hairline bg-surface-2/55 px-3 py-2.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-action" />
            <p className="text-[11px] font-bold tabular-nums">
              {zh
                ? `数据窗口：${report.dataWindow.from} 至 ${report.dataWindow.to} · 覆盖 ${report.dataWindow.daysCovered} 天`
                : `Data window: ${report.dataWindow.from} – ${report.dataWindow.to} · ${report.dataWindow.daysCovered} days`}
            </p>
            {report.dataWindow.note ? (
              <p className="min-w-0 flex-1 text-[10px] leading-4 text-fg-subtle">{report.dataWindow.note}</p>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* 1 · 数据源覆盖矩阵 */}
      {report.dataSourceCoverage?.length ? (
        <section className="border-t border-hairline px-4 py-4 sm:px-5">
          <SectionTitle icon={BarChart3} num="01" title={zh ? "数据源覆盖" : "Data source coverage"} />
          <div className="mt-3 divide-y divide-hairline rounded-xl border border-hairline">
            {report.dataSourceCoverage.map((row) => {
              const status = COVERAGE_STATUS_LABELS[row.status];
              const StatusIcon = status.icon;
              return (
                <div key={row.source} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5">
                  <span className="w-20 shrink-0 text-[11px] font-bold">
                    {COVERAGE_SOURCE_LABELS[row.source]?.[locale] ?? row.source}
                  </span>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase ${status.classes}`}>
                    <StatusIcon className="h-3 w-3" />
                    {status[locale]}
                  </span>
                  <span className="min-w-0 flex-1 text-[10px] leading-4 text-fg-muted">
                    {(zh ? row.impactZh : row.impactEn) ?? (zh ? row.impactEn : row.impactZh)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* 2 · 核心结论 */}
      {report.keyFindings?.length ? (
        <section className="border-t border-hairline px-4 py-4 sm:px-5">
          <SectionTitle icon={Layers} num="02" title={zh ? "核心结论" : "Key findings"} />
          <ul className="mt-3 space-y-2">
            {report.keyFindings.map((finding, index) => {
              const text = (zh ? finding.textZh : finding.textEn) ?? (zh ? finding.textEn : finding.textZh) ?? "";
              if (!text) return null;
              const severity = SEVERITY_LABELS[finding.severity];
              const refs = keepValidEvidenceIds(finding.evidenceIds, evidence);
              return (
                <li key={`${text}-${index}`} className="flex flex-wrap items-baseline gap-2 rounded-xl border border-hairline bg-surface-2/55 px-3 py-2.5">
                  <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase ${severity.classes}`}>
                    {severity[locale]}
                  </span>
                  <span className="min-w-0 flex-1 text-xs font-semibold leading-5">{text}</span>
                  {typeof finding.changePct === "number" && Number.isFinite(finding.changePct) ? (
                    <span className={`shrink-0 font-mono text-[10px] font-black tabular-nums ${finding.changePct < 0 ? "text-risk" : "text-positive"}`}>
                      {finding.changePct >= 0 ? "+" : ""}{finding.changePct}%
                    </span>
                  ) : null}
                  {refs.kept.map((id) => <EvidenceRefBadge key={id} id={id} />)}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* 3 · 关键指标：图表 + 指标行 */}
      {(report.charts?.length || metricRows.length > 0) ? (
        <section className="border-t border-hairline px-4 py-4 sm:px-5">
          <SectionTitle icon={Radar} num="03" title={zh ? "关键指标趋势" : "Metric trends"} />
          {report.charts?.length ? (
            <div className="mt-3 space-y-4">
              {report.charts.map((chart, index) => (
                <div key={`${chart.titleEn}-${index}`} className="rounded-xl border border-hairline bg-surface-2/55 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[11px] font-bold">{zh ? chart.titleZh : chart.titleEn}</p>
                    {(zh ? chart.windowLabelZh : chart.windowLabelEn) ? (
                      <p className="text-[10px] font-semibold text-fg-subtle">{zh ? chart.windowLabelZh : chart.windowLabelEn}</p>
                    ) : null}
                  </div>
                  <div className="mt-2">
                    <ReportChart spec={chart} locale={locale} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {metricRows.length > 0 ? (
            <div className={report.charts?.length ? "mt-3" : "mt-3"}>
              <div className="divide-y divide-hairline rounded-xl border border-hairline">
                {metricRows.map((row, index) => (
                  <div key={`${row.label}-${index}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span className="w-28 shrink-0 truncate text-[10px] font-bold text-fg-muted">{row.label}</span>
                    <span className="shrink-0 font-mono text-sm font-black tabular-nums">{row.value}</span>
                    {typeof row.deltaPct === "number" && Number.isFinite(row.deltaPct) ? (
                      <span className={`inline-flex shrink-0 items-center gap-0.5 font-mono text-[10px] font-black tabular-nums ${row.deltaPct < 0 ? "text-risk" : "text-positive"}`}>
                        {row.deltaPct < 0 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                        {row.deltaPct >= 0 ? "+" : ""}{row.deltaPct}%
                      </span>
                    ) : null}
                    {row.spark ? (
                      <span className="ml-auto h-8 w-24 shrink-0">
                        <ReportChart spec={row.spark} locale={locale} />
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 4 · 归因假设排序卡 */}
      {rankedHypotheses.length > 0 ? (
        <section className="border-t border-hairline px-4 py-4 sm:px-5">
          <SectionTitle icon={Radar} num="04" title={zh ? "可能的原因" : "Ranked causes"} />
          <div className="mt-3 space-y-2.5">
            {rankedHypotheses.map((item, index) => {
              const score = effectiveScore(item);
              const supporting = keepValidEvidenceIds(item.supportingEvidenceIds, evidence);
              const counter = keepValidEvidenceIds(item.counterEvidenceIds, evidence);
              return (
                <div key={`${item.cause}-${index}`} className="rounded-xl border border-hairline bg-surface-2/55 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-xs font-black text-fg-subtle">{String(index + 1).padStart(2, "0")}</span>
                      <p className="min-w-0 text-xs font-bold leading-5">{item.cause}</p>
                    </div>
                    <ConfidenceMeter score={score} locale={locale} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-hairline px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-fg-subtle">
                      {categoryLabel(item.category, locale)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-fg-muted">{item.why}</p>
                  {supporting.kept.length > 0 || counter.kept.length > 0 ? (
                    <div className="mt-3 grid gap-2 border-t border-hairline pt-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider text-positive">{zh ? "支持证据" : "Supporting"}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {supporting.kept.length > 0
                            ? supporting.kept.map((id) => <EvidenceRefBadge key={id} id={id} tone="positive" />)
                            : <span className="text-[10px] text-fg-subtle">{zh ? "暂无" : "None"}</span>}
                        </div>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider text-warn">{zh ? "反证" : "Counterevidence"}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {counter.kept.length > 0
                            ? counter.kept.map((id) => <EvidenceRefBadge key={id} id={id} tone="warn" />)
                            : <span className="text-[10px] text-fg-subtle">{zh ? "暂无" : "None"}</span>}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <p className="mt-2.5 text-[10px] font-semibold leading-4 text-action">
                    {zh ? "下一步验证：" : "Verify next: "}{item.verifyNext}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* 5 · 内容风险扫描 */}
      {report.contentRisks?.length ? (
        <section className="border-t border-hairline px-4 py-4 sm:px-5">
          <SectionTitle icon={ShieldAlert} num="05" title={zh ? "内容风险扫描" : "Content risks"} />
          <div className="mt-3 space-y-2.5">
            {report.contentRisks.map((risk, index) => (
              <div key={`${risk.excerpt}-${index}`} className="rounded-xl border border-hairline bg-surface-2/55 p-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] font-black text-fg-subtle">POST {risk.postIndex}</span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase ${RISK_SEVERITY_LABELS[risk.severity].classes}`}>
                    {RISK_SEVERITY_LABELS[risk.severity][locale]}
                  </span>
                  <span className="rounded-full border border-hairline px-1.5 py-0.5 text-[9px] font-black uppercase text-fg-muted">
                    {RISK_STATUS_LABELS[risk.status][locale]}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-fg-subtle">
                    {RISK_CATEGORY_LABELS[risk.category][locale]}
                  </span>
                </div>
                <blockquote className="mt-2 border-l-2 border-risk/40 pl-2.5 text-[11px] italic leading-5 text-fg">
                  {risk.excerpt}
                </blockquote>
                <p className="mt-2 text-xs leading-5 text-fg-muted">{risk.why}</p>
                <dl className="mt-2 space-y-1 border-t border-hairline pt-2">
                  <div className="flex items-baseline gap-2">
                    <dt className="shrink-0 text-[9px] font-black uppercase tracking-wider text-fg-subtle">{zh ? "依据" : "Basis"}</dt>
                    <dd className="min-w-0 text-[10px] leading-4 text-fg-muted">{risk.platformBasis}</dd>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <dt className="shrink-0 text-[9px] font-black uppercase tracking-wider text-fg-subtle">{zh ? "改写建议" : "Safer rewrite"}</dt>
                    <dd className="min-w-0 text-[10px] leading-4 font-semibold text-positive">{risk.saferRewrite}</dd>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <dt className="shrink-0 text-[9px] font-black uppercase tracking-wider text-fg-subtle">{zh ? "下一步" : "Verify next"}</dt>
                    <dd className="min-w-0 text-[10px] leading-4 text-action">{risk.verifyNext}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 6 · 行动计划（分时间层） */}
      {report.actionPlanV2 ? (
        <section className="border-t border-hairline px-4 py-4 sm:px-5">
          <SectionTitle icon={ClipboardList} num="06" title={zh ? "行动计划" : "Action plan"} />
          <div className="mt-3 space-y-3">
            {([
              ["first24Hours", zh ? "24 小时内" : "First 24 hours"],
              ["next7Days", zh ? "7 天内" : "Within 7 days"],
              ["next30Days", zh ? "30 天内" : "Within 30 days"]
            ] as const).map(([key, label]) => {
              const items = report.actionPlanV2![key];
              if (!items || items.length === 0) return null;
              return (
                <div key={key}>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-fg-muted">{label}</p>
                  <div className="mt-1.5 space-y-1.5">
                    {items.map((item, index) => {
                      const text = (zh ? item.textZh : item.textEn) ?? (zh ? item.textEn : item.textZh) ?? "";
                      if (!text) return null;
                      const impact = (zh ? item.expectedImpactZh : item.expectedImpactEn) ?? (zh ? item.expectedImpactEn : item.expectedImpactZh);
                      const verify = (zh ? item.verifyMetricZh : item.verifyMetricEn) ?? (zh ? item.verifyMetricEn : item.verifyMetricZh);
                      const refs = keepValidEvidenceIds(item.evidenceIds, evidence);
                      const action = item.workbenchActionId ? actionWorkbench.get(item.workbenchActionId) : undefined;
                      const runnable = action && action.readiness === "ready" && onAskAgent;
                      return (
                        <div key={`${text}-${index}`} className="rounded-xl border border-hairline bg-surface-2/55 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="min-w-0 flex-1 text-xs font-bold leading-5">{text}</p>
                            {runnable ? (
                              <button
                                type="button"
                                onClick={() => onAskAgent!(action!.agentPrompt)}
                                className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-lg bg-action px-2.5 py-1.5 text-[10px] font-black text-on-action shadow-sm transition hover:bg-action-strong"
                              >
                                <WandSparkles className="h-3 w-3" />
                                {zh ? "让智能体执行" : "Ask Agent"}
                                <ArrowUpRight className="h-3 w-3" />
                              </button>
                            ) : null}
                          </div>
                          {impact || verify ? (
                            <dl className="mt-2 space-y-1 border-t border-hairline pt-2">
                              {impact ? (
                                <div className="flex items-baseline gap-2">
                                  <dt className="shrink-0 text-[9px] font-black uppercase tracking-wider text-fg-subtle">{zh ? "预期影响" : "Expected impact"}</dt>
                                  <dd className="min-w-0 text-[10px] leading-4 text-fg-muted">{impact}</dd>
                                </div>
                              ) : null}
                              {verify ? (
                                <div className="flex items-baseline gap-2">
                                  <dt className="shrink-0 text-[9px] font-black uppercase tracking-wider text-fg-subtle">{zh ? "验证指标" : "Verify by"}</dt>
                                  <dd className="min-w-0 text-[10px] font-semibold leading-4 text-positive tabular-nums">{verify}</dd>
                                </div>
                              ) : null}
                            </dl>
                          ) : null}
                          {refs.kept.length > 0 ? (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {refs.kept.map((id) => <EvidenceRefBadge key={id} id={id} />)}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
      {/* 7 · 申诉与禁区 */}
      {(report.recoveryPlan?.appeal?.needed || report.doNotDo?.length) ? (
        <section className="border-t border-hairline px-4 py-4 sm:px-5">
          <SectionTitle icon={Shield} num="07" title={zh ? "申诉与禁区" : "Appeal & cautions"} />
          {report.recoveryPlan.appeal.needed ? (
            <div className="mt-3 rounded-xl border border-hairline bg-surface-2/55 p-3.5">
              {report.recoveryPlan.appeal.officialPath ? (
                <p className="text-xs leading-5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-fg-subtle">{zh ? "官方申诉路径" : "Official appeal path"} · </span>
                  <span className="font-semibold">{report.recoveryPlan.appeal.officialPath}</span>
                </p>
              ) : null}
              {report.recoveryPlan.appeal.draft ? (
                <div className="mt-2">
                  <p className="text-[9px] font-black uppercase tracking-wider text-fg-subtle">{zh ? "申诉草稿" : "Appeal draft"}</p>
                  <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-hairline bg-surface px-3 py-2.5 font-sans text-[11px] leading-5 text-fg">
                    {report.recoveryPlan.appeal.draft}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
          {report.doNotDo?.length ? (
            <ul className="mt-3 space-y-1.5">
              {report.doNotDo.map((item, index) => (
                <li key={`${item}-${index}`} className="flex items-start gap-2 rounded-xl border border-risk/20 bg-risk/[0.04] px-3 py-2">
                  <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-risk" />
                  <span className="min-w-0 text-xs font-semibold leading-5">{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* 8 · 附录（Pro） */}
      {(report.recheckCriteria?.length || report.nextEvidence?.length || evidence.length > 0) ? (
        <section className="relative border-t border-hairline px-4 py-4 sm:px-5">
          <SectionTitle icon={BookOpenText} num="08" title={zh ? "附录" : "Appendix"} />
          {!fullAccess ? (
            <div className="absolute inset-x-4 inset-y-4 z-10 flex items-center justify-center rounded-xl bg-surface/70 sm:inset-x-5">
              <div className="mx-4 rounded-xl border border-hairline bg-surface px-5 py-4 text-center shadow-panel">
                <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-brand/25 bg-brand/[0.08] text-brand">
                  <LockKeyhole className="h-4 w-4" />
                </span>
                <p className="mt-2.5 text-[9px] font-black uppercase tracking-[0.18em] text-brand">
                  {zh ? "Finfold 完整版" : "Finfold Pro"}
                </p>
                <p className="mt-1 text-pretty text-xs font-bold leading-5">
                  {zh ? "解锁完整证据清单与 PDF 导出" : "Unlock the evidence log and PDF export"}
                </p>
                <p className="mt-1 text-[10px] leading-4 text-fg-muted">
                  {zh ? "升级后可查看全部原始数据与复诊条件，并导出这份报告。" : "Upgrade to see all raw data and recheck criteria, and export this report."}
                </p>
                <Link
                  href="/billing"
                  className="focus-ring mt-3 inline-flex items-center gap-1 rounded-lg bg-action px-3 py-1.5 text-[10px] font-black text-on-action transition hover:bg-action-strong"
                >
                  {zh ? "查看方案" : "See plans"}
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ) : null}
          <div aria-hidden={!fullAccess} className={fullAccess ? "" : "pointer-events-none select-none blur-[3px]"}>
          {report.recheckCriteria?.length ? (
            <div className="mt-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-fg-subtle">{zh ? "复诊条件" : "Recheck when"}</p>
              <ul className="mt-1.5 space-y-1">
                {report.recheckCriteria.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex items-start gap-2 text-[11px] leading-5 text-fg-muted">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" />
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.nextEvidence?.length ? (
            <div className="mt-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-fg-subtle">{zh ? "补充证据" : "Next evidence"}</p>
              <ul className="mt-1.5 space-y-1">
                {report.nextEvidence.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex items-start gap-2 text-[11px] leading-5 text-fg-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {evidence.length > 0 ? (
            <div className="mt-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-fg-subtle">{zh ? "证据清单" : "Evidence log"}</p>
              <div className="mt-1.5 divide-y divide-hairline rounded-xl border border-hairline">
                {evidence.map((item) => (
                  <details key={item.id} className="group px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-bold">
                      <span className="font-mono text-[9px] font-black text-action">{item.id}</span>
                      <span className="min-w-0 truncate">{zh ? item.titleZh : item.titleEn}</span>
                      <span className="ml-auto shrink-0 font-mono text-[9px] text-fg-subtle group-open:hidden">{zh ? "展开" : "Open"}</span>
                    </summary>
                    <dl className="mt-2 space-y-1">
                      {item.rawPreview.slice(0, 6).map((row, index) => (
                        <div key={`${row.key}-${index}`} className="flex items-baseline gap-2">
                          <dt className="w-28 shrink-0 truncate text-[9px] font-bold uppercase text-fg-subtle">{row.key}</dt>
                          <dd className="min-w-0 text-[10px] leading-4 text-fg-muted">{row.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ))}
              </div>
            </div>
          ) : null}
          </div>
        </section>
      ) : null}
      {/* print-only footer — report id and stamp travel with every exported copy */}
      <footer className="print-only border-t border-hairline px-4 py-3 sm:px-5">
        <p className="flex flex-wrap items-center justify-between gap-2 font-mono text-[9px] font-bold uppercase tracking-wider text-fg-muted">
          <span>FINFOLD · {investigation.reportId} · v{investigation.reportVersion}</span>
          <span>{generatedAt}</span>
        </p>
      </footer>
    </article>
  );
}

function SectionTitle({ icon: Icon, num, title }: { icon: typeof Radar; num?: string; title: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-fg-muted">
      <Icon className="h-3.5 w-3.5 text-action" />
      {num ? <span className="font-mono text-fg-subtle">{num}</span> : null}
      {title}
    </div>
  );
}

function EvidenceRefBadge({ id, tone = "action" }: { id: string; tone?: "action" | "positive" | "warn" }) {
  const classes = tone === "positive"
    ? "border-positive/30 bg-positive/[0.08] text-positive"
    : tone === "warn"
      ? "border-warn/30 bg-warn/[0.08] text-warn"
      : "border-action/30 bg-action/[0.08] text-action";
  return (
    <button
      type="button"
      data-evidence-ref={id}
      title={`E → ${id}`}
      onClick={() => focusEvidenceCard(id)}
      className={`focus-ring inline-flex shrink-0 cursor-pointer items-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-black transition hover:brightness-110 ${classes}`}
    >
      {id}
    </button>
  );
}

/** 10-segment confidence meter — reads as a rating, not a progress bar. */
function ConfidenceMeter({ score, locale }: { score: number; locale: "zh" | "en" }) {
  const filled = Math.round(Math.max(0, Math.min(100, score)) / 10);
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5" aria-label={`${locale === "zh" ? "置信度" : "Confidence"} ${score}%`}>
      <span className="flex gap-[2px]" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <span
            key={index}
            className={`h-2.5 w-[5px] rounded-[1px] ${index < filled ? "bg-action-strong" : "bg-current/12"}`}
          />
        ))}
      </span>
      <span className="font-mono text-[10px] font-black tabular-nums text-fg-muted">{score}%</span>
    </span>
  );
}

function rankHypotheses(report: AccountInvestigationReport): AccountInvestigationReport["hypotheses"] {
  return [...report.hypotheses].sort((a, b) => effectiveScore(b) - effectiveScore(a));
}

function effectiveScore(item: AccountInvestigationReport["hypotheses"][number]): number {
  if (typeof item.confidenceScore === "number" && Number.isFinite(item.confidenceScore)) {
    return Math.max(0, Math.min(100, item.confidenceScore));
  }
  return fallbackScore(item.likelihood);
}

function fallbackScore(likelihood: "low" | "medium" | "high"): number {
  if (likelihood === "high") return 70;
  if (likelihood === "medium") return 45;
  return 20;
}

function categoryLabel(category: AccountInvestigationReport["hypotheses"][number]["category"], locale: "zh" | "en"): string {
  const labels: Record<string, { zh: string; en: string }> = {
    content: { zh: "内容", en: "Content" },
    distribution: { zh: "分发", en: "Distribution" },
    positioning: { zh: "定位", en: "Positioning" },
    account_health: { zh: "账号健康", en: "Account health" },
    policy: { zh: "合规", en: "Policy" },
    technical: { zh: "技术", en: "Technical" }
  };
  return labels[category][locale];
}

function formatStamp(value: string, locale: "zh" | "en"): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return locale === "zh" ? "刚刚" : "Just now";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
