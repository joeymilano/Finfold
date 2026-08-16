import type { createSupabaseAdminClient } from "@/lib/supabase";
import { getLocalizedPlatformLabel, platforms, type PlatformId } from "@/lib/platforms";
import type { GrowthStage } from "@/lib/agent/growth-briefing";
import {
  normalizeXhsEvidenceAccountUrl,
  type ImportedXhsMetricRow
} from "@/lib/agent/xhs-data-import";

export type WeeklyReportLocale = "zh" | "en";
export type WeeklyReportMode = "account_snapshots" | "creator_center_imports" | "post_cohorts" | "insufficient";
export type WeeklyAnomalySeverity = "warning" | "critical";

export type WeeklyMetricTotals = {
  samples: number;
  impressions: number;
  views: number;
  coverClickRate: number;
  averageViewSeconds: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  followerGrowth: number;
  profileVisits: number;
};

export type WeeklyMetricTrend = {
  key: "impressions" | "cover_click_rate" | "save_share_per_thousand" | "followers_per_thousand";
  label: string;
  current: number;
  previous: number;
  currentDisplay: string;
  previousDisplay: string;
  changePercent: number | null;
  direction: "up" | "down" | "flat" | "unknown";
};

export type WeeklyGrowthAnomaly = {
  id: string;
  stage: GrowthStage;
  severity: WeeklyAnomalySeverity;
  title: string;
  evidence: string;
  interpretation: string;
  action: string;
  metric: string;
  changePercent: number | null;
};

export type WeeklyGrowthReport = {
  generatedAt: string;
  platform: PlatformId | null;
  platformLabel: string;
  mode: WeeklyReportMode;
  comparisonLabel: string;
  fingerprint: string;
  headline: string;
  summary: string;
  current: WeeklyMetricTotals;
  previous: WeeklyMetricTotals;
  trends: WeeklyMetricTrend[];
  anomalies: WeeklyGrowthAnomaly[];
  wins: string[];
  nextAction: {
    title: string;
    detail: string;
    metric: string;
    agentPrompt: string;
  } | null;
  missingData: string[];
};

export type WeeklyReportInput = {
  platform: PlatformId;
  mode: Exclude<WeeklyReportMode, "insufficient">;
  current: WeeklyMetricTotals;
  previous: WeeklyMetricTotals;
  currentKey: string;
  previousKey: string;
};

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type MetricRow = {
  kit_id: string;
  platform: string;
  measured_at?: string | null;
  impressions?: number | null;
  views?: number | null;
  clicks?: number | null;
  cover_click_rate?: number | null;
  average_view_seconds?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
  follower_growth?: number | null;
  profile_visits?: number | null;
};

type SnapshotRow = {
  id: string;
  platform: string;
  measured_at: string;
  impressions?: number | null;
  views?: number | null;
  cover_click_rate?: number | null;
  average_view_seconds?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
  follower_growth?: number | null;
  profile_visits?: number | null;
};

type CohortSample = WeeklyMetricTotals & { observedAt: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_TOTALS: WeeklyMetricTotals = {
  samples: 0,
  impressions: 0,
  views: 0,
  coverClickRate: 0,
  averageViewSeconds: 0,
  likes: 0,
  comments: 0,
  saves: 0,
  shares: 0,
  followerGrowth: 0,
  profileVisits: 0
};

export async function loadWeeklyGrowthReport(
  admin: AdminClient,
  userId: string,
  locale: WeeklyReportLocale,
  preferredPlatform?: PlatformId,
  now = new Date()
): Promise<WeeklyGrowthReport> {
  let snapshotQuery = admin
    .from("account_performance_snapshots")
    .select("id, platform, measured_at, impressions, views, cover_click_rate, average_view_seconds, likes, comments, saves, shares, follower_growth, profile_visits")
    .eq("user_id", userId)
    .order("measured_at", { ascending: false })
    .limit(20);
  if (preferredPlatform) snapshotQuery = snapshotQuery.eq("platform", preferredPlatform);
  const snapshotResult = await snapshotQuery;
  const snapshotRows = ((snapshotResult.data ?? []) as unknown as SnapshotRow[])
    .filter((row) => isPlatformId(row.platform));
  const snapshotPlatform = choosePlatformWithComparison(snapshotRows, preferredPlatform);
  if (snapshotPlatform) {
    const pair = snapshotRows
      .filter((row) => row.platform === snapshotPlatform)
      .slice(0, 2);
    return buildWeeklyGrowthReport({
      platform: snapshotPlatform,
      mode: "account_snapshots",
      current: totalsFromSnapshot(pair[0]),
      previous: totalsFromSnapshot(pair[1]),
      currentKey: pair[0].measured_at,
      previousKey: pair[1].measured_at
    }, locale, now);
  }

  if (!preferredPlatform || preferredPlatform === "xiaohongshu") {
    const importComparison = await loadXhsImportComparison(admin, userId);
    if (importComparison) {
      return buildWeeklyGrowthReport({
        platform: "xiaohongshu",
        mode: "creator_center_imports",
        current: importComparison.current,
        previous: importComparison.previous,
        currentKey: importComparison.currentKey,
        previousKey: importComparison.previousKey
      }, locale, now);
    }
  }

  const metricsResult = await admin
    .from("performance_metrics")
    .select("kit_id, platform, measured_at, impressions, views, clicks, cover_click_rate, average_view_seconds, likes, comments, saves, shares, follower_growth, profile_visits")
    .eq("user_id", userId)
    .order("measured_at", { ascending: false })
    .limit(160);
  if (metricsResult.error) {
    return insufficientReport(locale, preferredPlatform, now);
  }
  const metricRows = ((metricsResult.data ?? []) as unknown as MetricRow[])
    .filter((row) => isPlatformId(row.platform));
  if (metricRows.length === 0) {
    return insufficientReport(locale, preferredPlatform, now);
  }

  const kitIds = Array.from(new Set(metricRows.map((row) => row.kit_id)));
  const { data: outputs } = await admin
    .from("kit_outputs")
    .select("kit_id, platform, published_at")
    .eq("user_id", userId)
    .in("kit_id", kitIds);
  const publishedAtByKey = new Map(
    (outputs ?? []).map((row) => [
      `${row.kit_id}:${row.platform}`,
      typeof row.published_at === "string" ? row.published_at : ""
    ])
  );
  const samples = metricRows.map((row): CohortSample & { platform: PlatformId } => ({
    ...totalsFromMetric(row),
    platform: row.platform as PlatformId,
    observedAt: publishedAtByKey.get(`${row.kit_id}:${row.platform}`) || row.measured_at || ""
  }));
  const platform = chooseCohortPlatform(samples, preferredPlatform);
  if (!platform) return insufficientReport(locale, preferredPlatform, now);

  const currentStart = new Date(now.getTime() - 7 * DAY_MS);
  const previousStart = new Date(now.getTime() - 14 * DAY_MS);
  const platformSamples = samples.filter((sample) => sample.platform === platform);
  const current = aggregateTotals(platformSamples.filter((sample) => {
    const timestamp = new Date(sample.observedAt).getTime();
    return timestamp >= currentStart.getTime() && timestamp <= now.getTime();
  }));
  const previous = aggregateTotals(platformSamples.filter((sample) => {
    const timestamp = new Date(sample.observedAt).getTime();
    return timestamp >= previousStart.getTime() && timestamp < currentStart.getTime();
  }));
  if (previous.samples === 0) {
    return insufficientReport(locale, platform, now, current);
  }
  return buildWeeklyGrowthReport({
    platform,
    mode: "post_cohorts",
    current,
    previous,
    currentKey: isoDay(now),
    previousKey: isoDay(currentStart)
  }, locale, now);
}

export function buildWeeklyGrowthReport(
  input: WeeklyReportInput,
  locale: WeeklyReportLocale,
  now = new Date()
): WeeklyGrowthReport {
  const isZh = locale === "zh";
  const platformLabel = getLocalizedPlatformLabel(input.platform, locale, true);
  const current = withDerivedAverages(input.current);
  const previous = withDerivedAverages(input.previous);
  const trends = buildTrends(current, previous, locale);
  const anomalies = detectAnomalies(current, previous, locale);
  const wins = detectWins(current, previous, locale);
  const primary = anomalies[0] ?? null;
  const comparisonLabel = input.mode === "account_snapshots"
    ? (isZh ? "最近两次账号快照" : "Latest two account snapshots")
    : input.mode === "creator_center_imports"
      ? (isZh ? "最近两次创作中心导入" : "Latest two Creator Center imports")
      : (isZh ? "最近 7 天 vs 前 7 天" : "Last 7 days vs previous 7 days");
  const headline = primary
    ? (isZh ? `${platformLabel} 最大异常：${primary.title}` : `${platformLabel} alert: ${primary.title}`)
    : (isZh ? `${platformLabel} 本周期没有显著下滑` : `${platformLabel} has no material decline this cycle`);
  const summary = primary
    ? (isZh
        ? `${primary.evidence} 这是一条需要验证的漏斗信号，不是未经验证的原因结论。`
        : `${primary.evidence} Treat this as a funnel signal to test, not a proven causal explanation.`)
    : (wins[0]
        ?? (isZh ? "主要指标保持稳定；继续完成当前实验，不额外增加变量。" : "Core metrics are stable. Finish the current experiment without adding variables."));
  const fingerprint = [
    input.platform,
    input.mode,
    input.currentKey,
    input.previousKey,
    primary?.id ?? "stable"
  ].join(":");

  return {
    generatedAt: now.toISOString(),
    platform: input.platform,
    platformLabel,
    mode: input.mode,
    comparisonLabel,
    fingerprint,
    headline,
    summary,
    current,
    previous,
    trends,
    anomalies,
    wins,
    nextAction: primary
      ? {
          title: primary.title,
          detail: primary.action,
          metric: primary.metric,
          agentPrompt: isZh
            ? `读取我的本周增长周报，调查“${primary.title}”。先解释证据，再给一个只改变单一变量的实验，主指标是${primary.metric}。`
            : `Read my weekly growth report and investigate "${primary.title}". Explain the evidence first, then propose one single-variable experiment using ${primary.metric} as the primary metric.`
        }
      : null,
    missingData: []
  };
}

function detectAnomalies(
  current: WeeklyMetricTotals,
  previous: WeeklyMetricTotals,
  locale: WeeklyReportLocale
): WeeklyGrowthAnomaly[] {
  const isZh = locale === "zh";
  const anomalies: Array<WeeklyGrowthAnomaly & { score: number }> = [];
  const add = (
    id: string,
    stage: GrowthStage,
    severity: WeeklyAnomalySeverity,
    title: string,
    evidence: string,
    interpretation: string,
    action: string,
    metric: string,
    changePercent: number | null,
    score: number
  ) => anomalies.push({ id, stage, severity, title, evidence, interpretation, action, metric, changePercent, score });

  if (previous.samples > 0 && current.samples === 0) {
    add(
      "publishing_gap",
      "distribution",
      "critical",
      isZh ? "最近 7 天没有形成可测量发布" : "No measurable post in the last 7 days",
      isZh
        ? `前一周期有 ${previous.samples} 篇可测量内容，本周期为 0。`
        : `The previous cohort had ${previous.samples} measurable post${previous.samples === 1 ? "" : "s"}; the current cohort has none.`,
      isZh ? "当前首先是发布节奏中断，不能把所有下滑归因于内容质量。" : "The first issue is a broken publishing cadence; not every decline should be attributed to content quality.",
      isZh ? "先恢复一篇可测量发布，只沿用上一轮最佳结构。" : "Restore one measurable post using the strongest structure from the previous cycle.",
      isZh ? "每周可测量发布数" : "Measurable posts per week",
      -100,
      140
    );
  }

  const impressionChange = percentChange(current.impressions, previous.impressions);
  if (previous.impressions >= 100 && impressionChange !== null && impressionChange <= -30) {
    add(
      "distribution_drop",
      "distribution",
      impressionChange <= -50 ? "critical" : "warning",
      isZh ? "曝光明显下滑" : "Reach dropped sharply",
      isZh
        ? `曝光从 ${formatNumber(previous.impressions)} 降至 ${formatNumber(current.impressions)}（${formatPercent(impressionChange)}）。`
        : `Impressions fell from ${formatNumber(previous.impressions)} to ${formatNumber(current.impressions)} (${formatPercent(impressionChange)}).`,
      isZh ? "优先检查发布频率、选题分发和首轮互动，不先改正文所有部分。" : "Check cadence, topic distribution, and early engagement before rewriting everything.",
      isZh ? "下一篇只更换选题入口或发布时间，其他变量保持不变。" : "Change only the topic entry or publish timing in the next post.",
      isZh ? "曝光数" : "Impressions",
      impressionChange,
      Math.abs(impressionChange) + 20
    );
  }

  const ctrChange = percentChange(current.coverClickRate, previous.coverClickRate);
  const ctrPointDrop = current.coverClickRate - previous.coverClickRate;
  if (previous.coverClickRate > 0 && ((ctrChange !== null && ctrChange <= -20) || ctrPointDrop <= -3)) {
    add(
      "click_drop",
      "click",
      ctrPointDrop <= -6 ? "critical" : "warning",
      isZh ? "封面点击率下滑" : "Cover click-through declined",
      isZh
        ? `封面点击率从 ${formatDecimal(previous.coverClickRate)}% 降至 ${formatDecimal(current.coverClickRate)}%（${formatPoints(ctrPointDrop)}）。`
        : `Cover CTR fell from ${formatDecimal(previous.coverClickRate)}% to ${formatDecimal(current.coverClickRate)}% (${formatPoints(ctrPointDrop)}).`,
      isZh ? "信号更接近封面承诺或标题入口问题，而不是内容深度结论。" : "The signal points closer to the cover promise or title entry than content depth.",
      isZh ? "下一篇只测试封面主张，正文结构保持不变。" : "Test only the cover promise in the next post and keep the body structure fixed.",
      isZh ? "封面点击率" : "Cover click-through rate",
      ctrChange,
      Math.abs(ctrChange ?? ctrPointDrop * 10) + 15
    );
  }

  const previousValueRate = rate(previous.saves + previous.shares, effectiveViews(previous)) * 1000;
  const currentValueRate = rate(current.saves + current.shares, effectiveViews(current)) * 1000;
  const valueChange = percentChange(currentValueRate, previousValueRate);
  if (previousValueRate > 0 && valueChange !== null && valueChange <= -25) {
    add(
      "value_drop",
      "value",
      valueChange <= -45 ? "critical" : "warning",
      isZh ? "收藏分享效率下降" : "Save/share efficiency declined",
      isZh
        ? `每千次观看收藏分享从 ${formatDecimal(previousValueRate)} 降至 ${formatDecimal(currentValueRate)}（${formatPercent(valueChange)}）。`
        : `Saves and shares per 1K views fell from ${formatDecimal(previousValueRate)} to ${formatDecimal(currentValueRate)} (${formatPercent(valueChange)}).`,
      isZh ? "内容可能被看见，但可复用价值或转发理由变弱。" : "The content may still be seen, but its reusable value or sharing reason weakened.",
      isZh ? "下一篇只增加一个可保存的清单、模板或判断框架。" : "Add one save-worthy checklist, template, or decision framework to the next post.",
      isZh ? "每千次观看收藏分享" : "Saves and shares per 1K views",
      valueChange,
      Math.abs(valueChange) + 10
    );
  }

  const previousFollowerRate = rate(previous.followerGrowth, effectiveViews(previous)) * 1000;
  const currentFollowerRate = rate(current.followerGrowth, effectiveViews(current)) * 1000;
  const followerChange = percentChange(currentFollowerRate, previousFollowerRate);
  if (
    current.followerGrowth < 0
    || (previousFollowerRate > 0 && followerChange !== null && followerChange <= -35)
  ) {
    const critical = current.followerGrowth < 0 || (followerChange !== null && followerChange <= -60);
    add(
      "conversion_drop",
      "conversion",
      critical ? "critical" : "warning",
      isZh ? "观看没有转成关注" : "Views are not converting to follows",
      isZh
        ? `每千次观看新增关注从 ${formatDecimal(previousFollowerRate)} 变为 ${formatDecimal(currentFollowerRate)}；本周期净涨粉 ${formatSigned(current.followerGrowth)}。`
        : `Followers per 1K views moved from ${formatDecimal(previousFollowerRate)} to ${formatDecimal(currentFollowerRate)}; net follower change is ${formatSigned(current.followerGrowth)}.`,
      isZh ? "信号提示账号关注理由或内容与人设的连接不足。" : "The signal suggests a weak follow reason or a weak link between content and account identity.",
      isZh ? "下一篇只强化一句明确的持续关注承诺，不同时改封面与正文结构。" : "Add one explicit ongoing follow promise without changing the cover and body structure at the same time.",
      isZh ? "每千次观看新增关注" : "Followers per 1K views",
      followerChange,
      Math.abs(followerChange ?? 0) + (current.followerGrowth < 0 ? 80 : 20)
    );
  }

  return anomalies
    .sort((a, b) => b.score - a.score)
    .map((anomaly) => ({
      id: anomaly.id,
      stage: anomaly.stage,
      severity: anomaly.severity,
      title: anomaly.title,
      evidence: anomaly.evidence,
      interpretation: anomaly.interpretation,
      action: anomaly.action,
      metric: anomaly.metric,
      changePercent: anomaly.changePercent
    }));
}

function detectWins(
  current: WeeklyMetricTotals,
  previous: WeeklyMetricTotals,
  locale: WeeklyReportLocale
): string[] {
  const isZh = locale === "zh";
  const wins: string[] = [];
  const impressionChange = percentChange(current.impressions, previous.impressions);
  if (impressionChange !== null && impressionChange >= 20) {
    wins.push(isZh ? `曝光提升 ${formatPercent(impressionChange)}。` : `Impressions increased ${formatPercent(impressionChange)}.`);
  }
  const currentValueRate = rate(current.saves + current.shares, effectiveViews(current)) * 1000;
  const previousValueRate = rate(previous.saves + previous.shares, effectiveViews(previous)) * 1000;
  const valueChange = percentChange(currentValueRate, previousValueRate);
  if (valueChange !== null && valueChange >= 20) {
    wins.push(isZh ? `收藏分享效率提升 ${formatPercent(valueChange)}。` : `Save/share efficiency increased ${formatPercent(valueChange)}.`);
  }
  const followerChange = percentChange(current.followerGrowth, previous.followerGrowth);
  if (current.followerGrowth > 0 && followerChange !== null && followerChange >= 20) {
    wins.push(isZh ? `净涨粉提升 ${formatPercent(followerChange)}。` : `Net follower growth increased ${formatPercent(followerChange)}.`);
  }
  return wins.slice(0, 3);
}

function buildTrends(
  current: WeeklyMetricTotals,
  previous: WeeklyMetricTotals,
  locale: WeeklyReportLocale
): WeeklyMetricTrend[] {
  const isZh = locale === "zh";
  const currentValueRate = rate(current.saves + current.shares, effectiveViews(current)) * 1000;
  const previousValueRate = rate(previous.saves + previous.shares, effectiveViews(previous)) * 1000;
  const currentFollowerRate = rate(current.followerGrowth, effectiveViews(current)) * 1000;
  const previousFollowerRate = rate(previous.followerGrowth, effectiveViews(previous)) * 1000;
  return [
    trend("impressions", isZh ? "曝光" : "Impressions", current.impressions, previous.impressions, formatNumber),
    trend("cover_click_rate", isZh ? "封面点击率" : "Cover CTR", current.coverClickRate, previous.coverClickRate, (value) => `${formatDecimal(value)}%`),
    trend("save_share_per_thousand", isZh ? "千次观看收藏分享" : "Saves/shares per 1K", currentValueRate, previousValueRate, formatDecimal),
    trend("followers_per_thousand", isZh ? "千次观看新增关注" : "Followers per 1K", currentFollowerRate, previousFollowerRate, formatDecimal)
  ];
}

function trend(
  key: WeeklyMetricTrend["key"],
  label: string,
  current: number,
  previous: number,
  formatter: (value: number) => string
): WeeklyMetricTrend {
  const change = percentChange(current, previous);
  return {
    key,
    label,
    current,
    previous,
    currentDisplay: formatter(current),
    previousDisplay: formatter(previous),
    changePercent: change,
    direction: change === null ? "unknown" : change > 3 ? "up" : change < -3 ? "down" : "flat"
  };
}

function insufficientReport(
  locale: WeeklyReportLocale,
  platform: PlatformId | undefined,
  now: Date,
  current: WeeklyMetricTotals = EMPTY_TOTALS
): WeeklyGrowthReport {
  const isZh = locale === "zh";
  const platformLabel = platform ? getLocalizedPlatformLabel(platform, locale, true) : (isZh ? "账号" : "Account");
  return {
    generatedAt: now.toISOString(),
    platform: platform ?? null,
    platformLabel,
    mode: "insufficient",
    comparisonLabel: isZh ? "等待第二个对比周期" : "Waiting for a second comparison period",
    fingerprint: `${platform ?? "all"}:insufficient:${isoDay(now)}`,
    headline: isZh ? "还不能判断上升或下降" : "Not enough history to call a trend yet",
    summary: isZh
      ? "至少需要两个账号快照，或前后两个 7 天周期各有一篇已发布内容。Finfold 不会用单个数字伪造趋势。"
      : "Finfold needs two account snapshots, or at least one published post in each 7-day cohort. It will not fabricate a trend from one number.",
    current,
    previous: EMPTY_TOTALS,
    trends: [],
    anomalies: [],
    wins: [],
    nextAction: null,
    missingData: isZh
      ? ["第二个账号数据快照，或前 7 天的发布结果"]
      : ["A second account snapshot or published results from the previous 7 days"]
  };
}

function choosePlatformWithComparison(
  rows: SnapshotRow[],
  preferred?: PlatformId
): PlatformId | null {
  if (preferred && rows.filter((row) => row.platform === preferred).length >= 2) return preferred;
  const counts = new Map<PlatformId, number>();
  for (const row of rows) {
    const platform = row.platform as PlatformId;
    counts.set(platform, (counts.get(platform) ?? 0) + 1);
  }
  return [...counts.entries()].find(([, count]) => count >= 2)?.[0] ?? null;
}

function chooseCohortPlatform(
  samples: Array<CohortSample & { platform: PlatformId }>,
  preferred?: PlatformId
): PlatformId | null {
  if (preferred && samples.some((sample) => sample.platform === preferred)) return preferred;
  const counts = new Map<PlatformId, number>();
  for (const sample of samples) {
    counts.set(sample.platform, (counts.get(sample.platform) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function totalsFromSnapshot(row: SnapshotRow): WeeklyMetricTotals {
  return withDerivedAverages({
    samples: 1,
    impressions: number(row.impressions),
    views: number(row.views),
    coverClickRate: number(row.cover_click_rate),
    averageViewSeconds: number(row.average_view_seconds),
    likes: number(row.likes),
    comments: number(row.comments),
    saves: number(row.saves),
    shares: number(row.shares),
    followerGrowth: number(row.follower_growth),
    profileVisits: number(row.profile_visits)
  });
}

function totalsFromMetric(row: MetricRow): WeeklyMetricTotals {
  return {
    samples: 1,
    impressions: number(row.impressions),
    views: number(row.views) || number(row.clicks),
    coverClickRate: number(row.cover_click_rate),
    averageViewSeconds: number(row.average_view_seconds),
    likes: number(row.likes),
    comments: number(row.comments),
    saves: number(row.saves),
    shares: number(row.shares),
    followerGrowth: number(row.follower_growth),
    profileVisits: number(row.profile_visits)
  };
}

export type XhsImportSnapshot = {
  id: string;
  created_at: string;
  workflow_id?: string | null;
  normalized_rows: unknown;
  provenance?: unknown;
};

/** Never compares Creator Center exports that belong to different stated accounts/workflows. */
export function selectXhsImportComparisonPair(
  snapshots: XhsImportSnapshot[]
): [XhsImportSnapshot, XhsImportSnapshot] | null {
  const current = snapshots[0];
  if (!current) return null;
  const identity = xhsImportSnapshotIdentity(current);
  if (!identity) return null;
  const previous = snapshots.slice(1).find(
    (snapshot) => xhsImportSnapshotIdentity(snapshot) === identity
  );
  return previous ? [current, previous] : null;
}

async function loadXhsImportComparison(
  admin: AdminClient,
  userId: string
): Promise<{
  current: WeeklyMetricTotals;
  previous: WeeklyMetricTotals;
  currentKey: string;
  previousKey: string;
} | null> {
  const { data, error } = await admin
    .from("agent_data_imports")
    .select("id, workflow_id, created_at, normalized_rows, provenance")
    .eq("user_id", userId)
    .eq("platform", "xiaohongshu")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data || data.length < 2) return null;
  const pair = selectXhsImportComparisonPair(data as unknown as XhsImportSnapshot[]);
  if (!pair) return null;
  const [currentSnapshot, previousSnapshot] = pair;
  const currentRows = importedMetricRows(currentSnapshot.normalized_rows);
  const previousRows = importedMetricRows(previousSnapshot.normalized_rows);
  if (currentRows.length === 0 || previousRows.length === 0) return null;
  const commonMetrics = commonCompleteMetrics(currentRows, previousRows);
  if (!commonMetrics.has("impressions") || !commonMetrics.has("views")) return null;
  return {
    current: weeklyTotalsFromXhsRows(currentRows, commonMetrics),
    previous: weeklyTotalsFromXhsRows(previousRows, commonMetrics),
    currentKey: `${currentSnapshot.created_at}:${currentSnapshot.id}`,
    previousKey: `${previousSnapshot.created_at}:${previousSnapshot.id}`
  };
}

function xhsImportSnapshotIdentity(snapshot: XhsImportSnapshot): string | null {
  const provenance = snapshot.provenance && typeof snapshot.provenance === "object"
    ? snapshot.provenance as Record<string, unknown>
    : {};
  const accountUrl = normalizeXhsEvidenceAccountUrl(provenance.accountUrl);
  if (accountUrl) return `account:${accountUrl}`;
  const workflowId = String(snapshot.workflow_id ?? "").trim();
  return workflowId ? `workflow:${workflowId}` : null;
}

const XHS_WEEKLY_METRICS = [
  "impressions",
  "views",
  "coverClickRate",
  "averageViewSeconds",
  "likes",
  "comments",
  "saves",
  "shares",
  "followerGrowth",
  "profileVisits"
] as const;
type XhsWeeklyMetric = typeof XHS_WEEKLY_METRICS[number];

function importedMetricRows(value: unknown): ImportedXhsMetricRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is ImportedXhsMetricRow => Boolean(
    row && typeof row === "object" && typeof (row as { title?: unknown }).title === "string"
  ));
}

function commonCompleteMetrics(
  current: ImportedXhsMetricRow[],
  previous: ImportedXhsMetricRow[]
): Set<XhsWeeklyMetric> {
  return new Set(XHS_WEEKLY_METRICS.filter((metric) =>
    current.every((row) => row.observedMetrics?.includes(metric))
    && previous.every((row) => row.observedMetrics?.includes(metric))
  ));
}

export function weeklyTotalsFromXhsRows(
  rows: ImportedXhsMetricRow[],
  metrics: ReadonlySet<XhsWeeklyMetric> = new Set(XHS_WEEKLY_METRICS)
): WeeklyMetricTotals {
  const has = (metric: XhsWeeklyMetric) => metrics.has(metric);
  const totals = rows.reduce((sum, row) => ({
    samples: sum.samples + 1,
    impressions: sum.impressions + (has("impressions") ? row.impressions : 0),
    views: sum.views + (has("views") ? row.views : 0),
    coverClickRate: sum.coverClickRate + (has("coverClickRate") && has("impressions")
      ? row.coverClickRate * Math.max(row.impressions, 1)
      : 0),
    averageViewSeconds: sum.averageViewSeconds + (has("averageViewSeconds") && has("views")
      ? row.averageViewSeconds * Math.max(row.views, 1)
      : 0),
    likes: sum.likes + (has("likes") ? row.likes : 0),
    comments: sum.comments + (has("comments") ? row.comments : 0),
    saves: sum.saves + (has("views") && has("saves") ? row.saves : 0),
    shares: sum.shares + (has("views") && has("shares") ? row.shares : 0),
    followerGrowth: sum.followerGrowth + (has("views") && has("followerGrowth") ? row.followerGrowth : 0),
    profileVisits: sum.profileVisits + (has("profileVisits") ? row.profileVisits : 0)
  }), { ...EMPTY_TOTALS });
  return {
    ...totals,
    coverClickRate: totals.coverClickRate / Math.max(totals.impressions, 1),
    averageViewSeconds: totals.averageViewSeconds / Math.max(totals.views, 1)
  };
}

function aggregateTotals(samples: WeeklyMetricTotals[]): WeeklyMetricTotals {
  if (samples.length === 0) return { ...EMPTY_TOTALS };
  const totals = samples.reduce((sum, sample) => ({
    samples: sum.samples + sample.samples,
    impressions: sum.impressions + sample.impressions,
    views: sum.views + sample.views,
    coverClickRate: sum.coverClickRate + sample.coverClickRate * Math.max(sample.impressions, 1),
    averageViewSeconds: sum.averageViewSeconds + sample.averageViewSeconds * Math.max(sample.views, 1),
    likes: sum.likes + sample.likes,
    comments: sum.comments + sample.comments,
    saves: sum.saves + sample.saves,
    shares: sum.shares + sample.shares,
    followerGrowth: sum.followerGrowth + sample.followerGrowth,
    profileVisits: sum.profileVisits + sample.profileVisits
  }), { ...EMPTY_TOTALS });
  return {
    ...totals,
    coverClickRate: totals.coverClickRate / Math.max(totals.impressions, 1),
    averageViewSeconds: totals.averageViewSeconds / Math.max(totals.views, 1)
  };
}

function withDerivedAverages(totals: WeeklyMetricTotals): WeeklyMetricTotals {
  return {
    ...totals,
    samples: Math.max(0, Math.round(totals.samples)),
    impressions: Math.max(0, Math.round(totals.impressions)),
    views: Math.max(0, Math.round(totals.views)),
    coverClickRate: Math.max(0, totals.coverClickRate),
    averageViewSeconds: Math.max(0, totals.averageViewSeconds),
    likes: Math.max(0, Math.round(totals.likes)),
    comments: Math.max(0, Math.round(totals.comments)),
    saves: Math.max(0, Math.round(totals.saves)),
    shares: Math.max(0, Math.round(totals.shares)),
    followerGrowth: Math.round(totals.followerGrowth),
    profileVisits: Math.max(0, Math.round(totals.profileVisits))
  };
}

function effectiveViews(totals: WeeklyMetricTotals): number {
  return totals.views > 0 ? totals.views : totals.impressions;
}

function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function isPlatformId(value: string): value is PlatformId {
  return platforms.some((platform) => platform.id === value);
}

function number(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatDecimal(value)}%`;
}

function formatPoints(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatDecimal(value)} pts`;
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatNumber(value)}`;
}
