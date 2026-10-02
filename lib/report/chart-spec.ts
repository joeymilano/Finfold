import { z } from "zod";
import type { GrowthBriefing } from "@/lib/agent/growth-briefing";
import type { WeeklyGrowthReport } from "@/lib/agent/weekly-growth-report";
import type { AccountInvestigation } from "@/lib/agent/account-investigation";

/**
 * Report evidence contracts (设计方案 §3.3 / §6.1).
 *
 * Evidence payloads are produced by real tool outputs — never by the model.
 * The loop forwards them on a dedicated `evidence` event so the chat UI can
 * render verifiable data cards, and every report conclusion must reference an
 * evidence id that exists in this run (renderer-side gate).
 */

export type EvidenceSource =
  | "creator_analytics"
  | "public_profile"
  | "platform_notice"
  | "platform_research"
  | "content_sample"
  | "user_upload";

export type EvidenceMetricTone = "positive" | "negative" | "neutral";

const chartPointSchema = z.object({
  x: z.string().min(1).max(40),
  y: z.number(),
  annotatedZh: z.string().max(60).optional(),
  annotatedEn: z.string().max(60).optional()
});

const chartSeriesSchema = z.object({
  nameZh: z.string().min(1).max(40),
  nameEn: z.string().min(1).max(40),
  points: z.array(chartPointSchema).max(120)
});

export const chartSpecSchema = z.object({
  type: z.enum(["sparkline", "line", "bar", "funnel"]),
  titleZh: z.string().min(1).max(80),
  titleEn: z.string().min(1).max(80),
  unit: z.string().max(10).optional(),
  windowLabelZh: z.string().max(40).optional(),
  windowLabelEn: z.string().max(40).optional(),
  series: z.array(chartSeriesSchema).min(1).max(3),
  evidenceIds: z.array(z.string().max(8)).max(4).optional()
});

export type ChartSpec = z.infer<typeof chartSpecSchema>;
export type ChartSeries = z.infer<typeof chartSeriesSchema>;
export type ChartPoint = z.infer<typeof chartPointSchema>;

export const evidenceMetricSchema = z.object({
  labelZh: z.string().min(1).max(40),
  labelEn: z.string().min(1).max(60),
  value: z.string().min(1).max(24),
  deltaPct: z.number().min(-9999).max(9999).optional(),
  tone: z.enum(["positive", "negative", "neutral"]).optional()
});

export const evidencePayloadSchema = z.object({
  id: z.string().min(1).max(8),
  toolName: z.string().min(1).max(64),
  titleZh: z.string().min(1).max(80),
  titleEn: z.string().min(1).max(80),
  source: z.enum([
    "creator_analytics", "public_profile", "platform_notice",
    "platform_research", "content_sample", "user_upload"
  ]),
  capturedAt: z.string().min(1),
  windowZh: z.string().max(40).optional(),
  windowEn: z.string().max(60).optional(),
  metrics: z.array(evidenceMetricSchema).max(4),
  chart: chartSpecSchema.optional(),
  rawPreview: z.array(z.object({
    key: z.string().min(1).max(40),
    value: z.string().min(1).max(120)
  })).max(8),
  limitationsZh: z.array(z.string().min(1).max(120)).max(4).optional(),
  limitationsEn: z.array(z.string().min(1).max(160)).max(4).optional()
});

export type EvidencePayload = z.infer<typeof evidencePayloadSchema>;
export type EvidenceMetric = z.infer<typeof evidenceMetricSchema>;

/** Frame-size guard (设计方案 §7.4): trim anything a builder may over-produce. */
export function sanitizeEvidence(evidence: EvidencePayload): EvidencePayload {
  return evidencePayloadSchema.parse({
    ...evidence,
    metrics: evidence.metrics.slice(0, 4),
    rawPreview: evidence.rawPreview.slice(0, 8),
    limitationsZh: evidence.limitationsZh?.slice(0, 4),
    limitationsEn: evidence.limitationsEn?.slice(0, 4),
    chart: evidence.chart
      ? {
        ...evidence.chart,
        series: evidence.chart.series.slice(0, 3).map((series) => ({
          ...series,
          points: series.points.slice(0, 60)
        }))
      }
      : undefined
  });
}

export function isEvidenceArray(value: unknown): value is EvidencePayload[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => evidencePayloadSchema.safeParse(item).success);
}

/** Extract a safe `evidence` field from any tool result, if present. */
export function extractToolEvidence(result: unknown): EvidencePayload[] | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const candidate = (result as Record<string, unknown>).evidence;
  if (!isEvidenceArray(candidate)) return null;
  return candidate.map(sanitizeEvidence);
}

function compactNumber(value: number, locale: "zh" | "en"): string {
  const safe = Number.isFinite(value) ? value : 0;
  if (locale === "zh") {
    if (Math.abs(safe) >= 100_000_000) return `${trim(safe / 100_000_000)}亿`;
    if (Math.abs(safe) >= 10_000) return `${trim(safe / 10_000)}万`;
    return String(Math.round(safe));
  }
  if (Math.abs(safe) >= 1_000_000) return `${trim(safe / 1_000_000)}M`;
  if (Math.abs(safe) >= 1_000) return `${trim(safe / 1_000)}k`;
  return String(Math.round(safe));
}

function trim(value: number): string {
  return (Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1)).replace(/\.0$/, "");
}

function toneFromDirection(direction: "up" | "down" | "flat" | "unknown"): EvidenceMetricTone {
  if (direction === "up") return "positive";
  if (direction === "down") return "negative";
  return "neutral";
}

/**
 * Evidence for `analyze_account_performance` — built from the real growth
 * briefing. When daily impression points are available the card gets a
 * sparkline; without them the card stays metric-only (honest, no fake line).
 */
export function buildBriefingEvidence(
  briefing: GrowthBriefing,
  dailyImpressions?: Array<{ date: string; impressions: number }>,
  locale: "zh" | "en" = "zh"
): EvidencePayload {
  const fallbackChart = buildFunnelChartFromTotals(briefing.funnelTotals, locale);
  const zh = locale === "zh";
  const metrics: EvidenceMetric[] = [
    {
      labelZh: "样本内容",
      labelEn: "Posts measured",
      value: String(briefing.sampleSize),
      tone: "neutral"
    }
  ];
  if (briefing.northStar.value) {
    metrics.push({
      labelZh: briefing.northStar.label || "北极星指标",
      labelEn: briefing.northStar.label || "North star",
      value: briefing.northStar.value.slice(0, 24),
      tone: "neutral"
    });
  }
  const funnelPreview = briefing.funnel.slice(0, 8).map((stage) => ({
    key: stage.label.slice(0, 40),
    value: stage.value.slice(0, 120)
  }));
  const points = (dailyImpressions ?? [])
    .slice(-60)
    .map((day) => ({ x: day.date, y: day.impressions }));
  return sanitizeEvidence({
    id: "E1",
    toolName: "analyze_account_performance",
    titleZh: "读取了发布回流数据",
    titleEn: "Read your publishing data",
    source: "creator_analytics",
    capturedAt: briefing.generatedAt,
    windowZh: `${briefing.sampleSize} 篇内容`,
    windowEn: `${briefing.sampleSize} posts`,
    metrics,
    chart: points.length >= 2
      ? {
        type: "sparkline",
        titleZh: "曝光趋势",
        titleEn: "Reach trend",
        unit: zh ? "次" : "",
        series: [{ nameZh: "曝光", nameEn: "Reach", points }]
      }
      : fallbackChart,
    rawPreview: funnelPreview.length > 0 ? funnelPreview : [{ key: zh ? "汇总" : "Summary", value: briefing.summary.slice(0, 120) }],
    limitationsZh: briefing.missingData.length > 0 ? briefing.missingData.slice(0, 4) : undefined,
    limitationsEn: briefing.missingData.length > 0 ? briefing.missingData.slice(0, 4) : undefined
  });
}

/** Evidence for `get_weekly_growth_report` — week-over-week deltas from real totals. */
export function buildWeeklyReportEvidence(report: WeeklyGrowthReport): EvidencePayload {
  const metrics: EvidenceMetric[] = report.trends.slice(0, 4).map((trend) => ({
    labelZh: trend.label,
    labelEn: trend.label,
    value: trend.currentDisplay.slice(0, 24),
    deltaPct: trend.changePercent ?? undefined,
    tone: toneFromDirection(trend.direction)
  }));
  const rawPreview = report.trends.slice(0, 6).map((trend) => ({
    key: trend.label.slice(0, 40),
    value: `${trend.previousDisplay} → ${trend.currentDisplay}`.slice(0, 120)
  }));
  if (report.anomalies.length > 0) {
    rawPreview.push({
      key: "异常",
      value: report.anomalies[0].title.slice(0, 120)
    });
  }
  return sanitizeEvidence({
    id: "E1",
    toolName: "get_weekly_growth_report",
    titleZh: "对比了本周与上周",
    titleEn: "Compared this week to last",
    source: "creator_analytics",
    capturedAt: report.generatedAt,
    windowZh: "近 7 天 vs 前 7 天",
    windowEn: "Last 7 days vs previous 7 days",
    metrics: metrics.length > 0 ? metrics : [{
      labelZh: "样本内容",
      labelEn: "Posts measured",
      value: String(report.current.samples),
      tone: "neutral" as const
    }],
    rawPreview: rawPreview.length > 0
      ? rawPreview
      : [{ key: "汇总", value: report.summary.slice(0, 120) }],
    limitationsZh: report.missingData.length > 0 ? report.missingData.slice(0, 4) : undefined,
    limitationsEn: report.missingData.length > 0 ? report.missingData.slice(0, 4) : undefined
  });
}

/** Same-unit funnel totals powering an honest funnel chart (no faked ratios). */
export type FunnelTotals = NonNullable<GrowthBriefing["funnelTotals"]>;

const FUNNEL_BREAK_DROP_PCT = 50;

/**
 * Build a funnel ChartSpec from real absolute totals. Stages are impressions →
 * clicks → views → interactions → followers; only same-unit counts take part
 * (rates such as CTR % are excluded by design). The first drop of ≥ 50%
 * between adjacent stages is annotated as the funnel break — the chart never
 * draws an unexplained cliff.
 */
export function buildFunnelChartFromTotals(
  totals: FunnelTotals | undefined,
  locale: "zh" | "en" = "zh"
): ChartSpec | undefined {
  if (!totals || totals.impressions <= 0) return undefined;
  const zh = locale === "zh";
  const stages: Array<{ label: string; value: number }> = [
    { label: zh ? "曝光" : "Impressions", value: totals.impressions },
    { label: zh ? "点击" : "Clicks", value: totals.clicks },
    { label: zh ? "观看" : "Views", value: totals.views },
    { label: zh ? "互动" : "Interactions", value: totals.interactions },
    { label: zh ? "关注" : "Followers", value: totals.followers }
  ];
  let lastPositive = stages.length - 1;
  while (lastPositive > 0 && stages[lastPositive].value <= 0) lastPositive -= 1;
  const used = stages.slice(0, lastPositive + 1);
  if (used.length < 2) return undefined;
  let breakMarked = false;
  const points = used.map((stage, index) => {
    const previous = used[index - 1];
    const dropPct = previous && previous.value > 0 && stage.value < previous.value
      ? Math.round(((previous.value - stage.value) / previous.value) * 100)
      : 0;
    const isBreak = !breakMarked && dropPct >= FUNNEL_BREAK_DROP_PCT;
    if (isBreak) breakMarked = true;
    return {
      x: stage.label,
      y: stage.value,
      ...(isBreak
        ? {
          annotatedZh: `断点 -${dropPct}%`,
          annotatedEn: `Break -${dropPct}%`
        }
        : {})
    };
  });
  return {
    type: "funnel",
    titleZh: zh ? "转化漏斗" : "Conversion funnel",
    titleEn: "Conversion funnel",
    series: [{ nameZh: zh ? "漏斗" : "Funnel", nameEn: "Funnel", points }]
  };
}

const evidenceLevelSource: Record<AccountInvestigation["evidenceLevel"], EvidenceSource> = {
  link_only: "public_profile",
  public_profile: "public_profile",
  content_sample: "content_sample",
  creator_analytics: "creator_analytics",
  platform_notice: "platform_notice"
};

const evidenceLevelLabels: Record<AccountInvestigation["evidenceLevel"], { zh: string; en: string }> = {
  link_only: { zh: "仅账号链接", en: "Link only" },
  public_profile: { zh: "公开主页", en: "Public profile" },
  content_sample: { zh: "Post 原文", en: "Post sample" },
  creator_analytics: { zh: "账号后台数据", en: "Creator analytics" },
  platform_notice: { zh: "平台通知", en: "Platform notice" }
};

/** Evidence for `investigate_social_account` — public profile signals + findings. */
export function buildInvestigationEvidence(investigation: AccountInvestigation): EvidencePayload {
  const { report, publicEvidence } = investigation;
  const signals = publicEvidence.signals.slice(0, 4);
  const metrics: EvidenceMetric[] = [
    {
      labelZh: "证据等级",
      labelEn: "Evidence level",
      value: evidenceLevelLabels[investigation.evidenceLevel].zh,
      tone: "neutral"
    },
    {
      labelZh: "主页信号",
      labelEn: "Profile signals",
      value: String(publicEvidence.signals.length),
      tone: publicEvidence.signals.some((signal) => signal.kind === "profile_unavailable") ? "negative" : "neutral"
    },
    {
      labelZh: "诊断要点",
      labelEn: "Findings",
      value: String(report.evidence.length),
      tone: "neutral"
    }
  ];
  const rawPreview = signals.map((signal) => ({
    key: signal.kind.replace(/_/g, " ").slice(0, 40),
    value: signal.detail.slice(0, 120)
  }));
  report.evidence.slice(0, 8 - rawPreview.length).forEach((item) => {
    rawPreview.push({
      key: item.source.replace(/_/g, " ").slice(0, 40),
      value: item.finding.slice(0, 120)
    });
  });
  return sanitizeEvidence({
    id: "E1",
    toolName: "investigate_social_account",
    titleZh: "检查了账号主页可见性",
    titleEn: "Checked the public profile",
    source: evidenceLevelSource[investigation.evidenceLevel],
    capturedAt: publicEvidence.capturedAt,
    windowZh: `证据等级：${evidenceLevelLabels[investigation.evidenceLevel].zh}`,
    windowEn: `Evidence: ${evidenceLevelLabels[investigation.evidenceLevel].en}`,
    metrics,
    rawPreview: rawPreview.length > 0 ? rawPreview : [{ key: "结论", value: report.headline.slice(0, 120) }],
    limitationsZh: publicEvidence.limitations.length > 0 ? publicEvidence.limitations.slice(0, 4) : undefined,
    limitationsEn: publicEvidence.limitations.length > 0 ? publicEvidence.limitations.slice(0, 4) : undefined
  });
}

/** Re-number evidence ids in arrival order: E1, E2, … */
export function renumberEvidence(items: EvidencePayload[]): EvidencePayload[] {
  return items.map((item, index) => ({ ...item, id: `E${index + 1}` }));
}

export { compactNumber };
