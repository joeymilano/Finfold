import type { GrowthMetricSample } from "@/lib/agent/growth-briefing";

export type ImportedXhsMetricRow = {
  title: string;
  publishedAt?: string;
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
  /** Columns actually present in the source. Keeps a real zero distinct from a missing metric. */
  observedMetrics?: Array<Exclude<keyof ImportedXhsMetricRow, "title" | "publishedAt" | "observedMetrics">>;
};

export type XhsDistribution = {
  count: number;
  p25: number | null;
  median: number | null;
  p75: number | null;
};

export type XhsMetricDistributions = {
  impressions: XhsDistribution;
  coverClickRate: XhsDistribution;
  averageViewSeconds: XhsDistribution;
  saveSharePerThousand: XhsDistribution;
  followersPerThousand: XhsDistribution;
};

type ImportedXhsSourceField = Exclude<keyof ImportedXhsMetricRow, "observedMetrics">;

const XHS_HOSTS = ["xiaohongshu.com", "xhslink.com", "rednote.com"];

/** Canonical identity used to bind one private import to its stated account. */
export function normalizeXhsEvidenceAccountUrl(value: unknown): string | null {
  const source = typeof value === "string" ? value.trim() : "";
  if (!source) return null;
  try {
    const url = new URL(source);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !XHS_HOSTS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    )) return null;
    url.hostname = hostname;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

export function xhsImportAccountAssociation(
  provenance: unknown,
  requestedAccountUrl: string | undefined
): "match" | "mismatch" | "legacy_unbound" | "not_requested" {
  const requested = normalizeXhsEvidenceAccountUrl(requestedAccountUrl);
  if (!requested) return "not_requested";
  const record = provenance && typeof provenance === "object"
    ? provenance as Record<string, unknown>
    : {};
  const associated = normalizeXhsEvidenceAccountUrl(record.accountUrl);
  if (!associated) return "legacy_unbound";
  return associated === requested ? "match" : "mismatch";
}

type XhsBottleneckDefinition = {
  stage: "measurement" | "distribution" | "click" | "retention" | "value" | "conversion";
  title: Record<"zh" | "en", string>;
  summary: Record<"zh" | "en", string>;
  metric: Record<"zh" | "en", string>;
  action: Record<"zh" | "en", string>;
  evidence: (values: XhsMetricDistributions, locale: "zh" | "en") => string;
};

const HEADER_ALIASES: Record<ImportedXhsSourceField, string[]> = {
  title: ["title", "note", "笔记", "标题", "笔记标题", "内容"],
  publishedAt: ["publishedat", "publishdate", "date", "发布时间", "发布日期", "发布日"],
  impressions: ["impressions", "exposure", "曝光", "曝光量", "展现", "展现量"],
  views: ["views", "view", "观看", "观看量", "阅读", "阅读量", "浏览"],
  coverClickRate: ["coverclickrate", "ctr", "点击率", "封面点击率", "封面打开率"],
  averageViewSeconds: ["averageviewseconds", "avgviewseconds", "平均观看时长", "平均阅读时长"],
  likes: ["likes", "like", "点赞", "点赞数"],
  comments: ["comments", "comment", "评论", "评论数"],
  saves: ["saves", "save", "收藏", "收藏数"],
  shares: ["shares", "share", "分享", "转发", "分享数"],
  followerGrowth: ["followergrowth", "followers", "涨粉", "新增关注", "新增粉丝", "粉丝增长"],
  profileVisits: ["profilevisits", "主页访问", "主页访客", "主页浏览"]
};

export function normalizeXhsMetricTable(rows: unknown[][]): {
  rows: ImportedXhsMetricRow[];
  columns: string[];
  ignoredRows: number;
} {
  if (rows.length === 0) return { rows: [], columns: [], ignoredRows: 0 };
  const headers = rows[0].map((value) => String(value ?? "").trim());
  const indexByField = new Map<ImportedXhsSourceField, number>();
  for (const field of Object.keys(HEADER_ALIASES) as ImportedXhsSourceField[]) {
    const index = headers.findIndex((header) => HEADER_ALIASES[field].includes(normalizeHeader(header)));
    if (index >= 0) indexByField.set(field, index);
  }

  if (![...indexByField.keys()].some((field) => field !== "title" && field !== "publishedAt")) {
    throw new Error("没有识别到小红书指标列。请至少包含曝光、观看、点击率、点赞、收藏或关注增长中的一项。");
  }

  const normalized: ImportedXhsMetricRow[] = [];
  let ignoredRows = 0;
  for (const source of rows.slice(1, 501)) {
    if (!source.some((value) => String(value ?? "").trim())) continue;
    const item: ImportedXhsMetricRow = {
      title: cellText(source, indexByField.get("title")) || `导入笔记 ${normalized.length + 1}`,
      publishedAt: normalizeDate(cellText(source, indexByField.get("publishedAt"))),
      impressions: cellNumber(source, indexByField.get("impressions")),
      views: cellNumber(source, indexByField.get("views")),
      coverClickRate: cellNumber(source, indexByField.get("coverClickRate")),
      averageViewSeconds: cellNumber(source, indexByField.get("averageViewSeconds")),
      likes: cellNumber(source, indexByField.get("likes")),
      comments: cellNumber(source, indexByField.get("comments")),
      saves: cellNumber(source, indexByField.get("saves")),
      shares: cellNumber(source, indexByField.get("shares")),
      followerGrowth: cellNumber(source, indexByField.get("followerGrowth"), true),
      profileVisits: cellNumber(source, indexByField.get("profileVisits")),
      observedMetrics: [...indexByField.entries()].filter(
        ([field, index]) => field !== "title" && field !== "publishedAt" && hasNumericCell(source[index])
      ).map(
        ([field]) => field
      ).filter(
        (field): field is Exclude<ImportedXhsSourceField, "title" | "publishedAt"> =>
          field !== "title" && field !== "publishedAt"
      )
    };
    if ((item.observedMetrics?.length ?? 0) === 0) {
      ignoredRows += 1;
      continue;
    }
    normalized.push(item);
  }
  return { rows: normalized, columns: headers.filter(Boolean), ignoredRows };
}

export function parseCsvTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\"") {
      if (quoted && text[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Creator Center tables pasted from a browser are usually tab-separated. */
export function parseXhsTabularText(text: string): string[][] {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.includes("\t") && !firstLine.includes(",")) {
    return text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.split("\t"));
  }
  return parseCsvTable(text.replace(/^\uFEFF/, ""));
}

export function importedRowsToGrowthSamples(
  rows: ImportedXhsMetricRow[],
  importId: string
): GrowthMetricSample[] {
  return rows.map((row, index) => ({
    kitId: `agent-import-${importId}-${index}`,
    platform: "xiaohongshu",
    title: row.title,
    scope: "post",
    measuredAt: row.publishedAt,
    impressions: row.impressions,
    views: row.views,
    clicks: 0,
    coverClickRate: row.coverClickRate,
    averageViewSeconds: row.averageViewSeconds,
    likes: row.likes,
    comments: row.comments,
    saves: row.saves,
    shares: row.shares,
    followerGrowth: row.followerGrowth,
    profileVisits: row.profileVisits,
    leads: 0,
    signups: 0,
    revenue: 0
  }));
}

/**
 * Stable tenant-scoped UUIDv8 for one imported payload. Using it as the row
 * primary key makes concurrent duplicate requests converge on one insert.
 */
export async function xhsImportStorageId(
  userId: string,
  workflowId: string,
  fingerprint: string
): Promise<string> {
  const input = new TextEncoder().encode(`${userId}:${workflowId}:${fingerprint}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export function buildXhsAnalyticsReport(
  samples: GrowthMetricSample[],
  locale: "zh" | "en" = "zh",
  now = new Date()
) {
  const zh = locale === "zh";
  const youngSamples = samples.filter((sample) => isYoungerThanSevenDays(sample.measuredAt, now));
  const matureSamples = samples.filter((sample) => !isYoungerThanSevenDays(sample.measuredAt, now));
  const distributions = metricDistributions(matureSamples);
  const representativeSamples = [...matureSamples]
    .sort((left, right) => timestamp(right.measuredAt) - timestamp(left.measuredAt))
    .slice(0, Math.min(3, matureSamples.length));
  const representativeDistributions = metricDistributions(representativeSamples);
  const limitations = [
    youngSamples.length > 0
      ? (zh ? `${youngSamples.length} 篇发布不足 7 天，已从成熟结论中排除。` : `${youngSamples.length} posts younger than 7 days were excluded from mature conclusions.`)
      : null,
    matureSamples.length < 5
      ? (zh ? `成熟样本只有 ${matureSamples.length} 篇，不总结长期趋势。` : `Only ${matureSamples.length} mature posts; no long-term trend is claimed.`)
      : null,
    zh ? "以下是相关信号，不是已证实的因果关系。" : "These are correlated signals, not proven causes."
  ].filter((item): item is string => Boolean(item));

  const bottleneck = earliestBottleneck(distributions, representativeDistributions, matureSamples.length);
  return {
    hasEnoughData: matureSamples.length > 0,
    sampleSize: samples.length,
    matureSampleSize: matureSamples.length,
    youngExcluded: youngSamples.length,
    trendEligible: matureSamples.length >= 5,
    groupComparisonEligible: false,
    title: bottleneck.title[locale],
    summary: bottleneck.summary[locale],
    bottleneck: bottleneck.stage,
    primaryMetric: bottleneck.metric[locale],
    action: bottleneck.action[locale],
    evidence: bottleneck.evidence(distributions, locale),
    confidence: matureSamples.length > 0 ? "measured" : "hypothesis",
    distributions,
    limitations
  };
}

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").toLowerCase().replace(/[\s_\-()%（）]/g, "");
}

function cellText(row: unknown[], index: number | undefined): string {
  return index === undefined ? "" : String(row[index] ?? "").trim();
}

function cellNumber(row: unknown[], index: number | undefined, allowNegative = false): number {
  if (index === undefined) return 0;
  const value = parseMetricNumber(row[index]);
  if (!Number.isFinite(value)) return 0;
  return allowNegative ? value : Math.max(0, value);
}

function hasNumericCell(value: unknown): boolean {
  return Number.isFinite(parseMetricNumber(value));
}

function parseMetricNumber(value: unknown): number {
  const source = String(value ?? "").trim();
  if (!source || source === "—" || source === "-") return Number.NaN;
  const duration = source.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (duration) {
    return duration[3]
      ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
      : Number(duration[1]) * 60 + Number(duration[2]);
  }
  const normalized = source.replace(/[,，%\s]/g, "").toLowerCase();
  const multiplier = /(?:万|w)$/.test(normalized)
    ? 10_000
    : /(?:千|k)$/.test(normalized)
      ? 1_000
      : 1;
  const numeric = multiplier === 1 ? normalized : normalized.slice(0, -1);
  return Number(numeric) * multiplier;
}

function normalizeDate(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isYoungerThanSevenDays(value: string | undefined, now: Date): boolean {
  if (!value) return false;
  const measuredAt = new Date(value);
  if (Number.isNaN(measuredAt.getTime())) return false;
  const ageMs = now.getTime() - measuredAt.getTime();
  return ageMs >= 0 && ageMs < 7 * 24 * 60 * 60 * 1000;
}

function distribution(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75)
  };
}

function percentile(sorted: number[], ratio: number): number | null {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return round(sorted[lower]);
  const weight = index - lower;
  return round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

function sampleCoverCtr(sample: GrowthMetricSample): number {
  if (sample.coverClickRate > 0) return sample.coverClickRate;
  const views = sample.views || sample.clicks;
  return sample.impressions > 0 ? (views / sample.impressions) * 100 : 0;
}

function perThousand(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 1000 : 0;
}

function earliestBottleneck(
  distributions: XhsMetricDistributions,
  representative: XhsMetricDistributions,
  sampleSize: number
): XhsBottleneckDefinition {
  const stages: Record<XhsBottleneckDefinition["stage"], XhsBottleneckDefinition> = {
    measurement: {
      stage: "measurement",
      title: { zh: "先补一篇成熟数据", en: "Add one mature result" },
      summary: { zh: "目前没有发布满 7 天、可用于判断的单篇数据。", en: "No post has at least seven days of mature data." },
      metric: { zh: "成熟样本数", en: "Mature samples" },
      action: { zh: "回填至少一篇完整漏斗数据。", en: "Add one post's complete funnel." },
      evidence: (_values, locale) => locale === "zh" ? "成熟样本数为 0。" : "There are no mature samples."
    },
    distribution: {
      stage: "distribution",
      title: { zh: "先修有效曝光", en: "Fix qualified distribution first" },
      summary: { zh: "最上游的曝光信号偏弱，暂不同时修改标题和正文。", en: "The earliest weak signal is distribution; keep title and body stable." },
      metric: { zh: "单篇曝光中位数", en: "Median impressions" },
      action: { zh: "只测试选题包装、关键词或发布时间中的一个变量。", en: "Test one of topic framing, keywords, or timing." },
      evidence: (values, locale) => `${locale === "zh" ? "曝光 P25/P50/P75" : "Impressions P25/P50/P75"}: ${formatDistribution(values.impressions)}`
    },
    click: {
      stage: "click",
      title: { zh: "只重做标题与封面承诺", en: "Change only the title and cover promise" },
      summary: { zh: "曝光已经发生，点击是更早的断点。", en: "Distribution exists; click is the earliest break." },
      metric: { zh: "封面点击率中位数", en: "Median cover CTR" },
      action: { zh: "保持正文不变，测试两个只改变利益点表达的标题和封面。", en: "Hold the body constant and test two cover promises." },
      evidence: (values, locale) => `${locale === "zh" ? "点击率 P25/P50/P75" : "CTR P25/P50/P75"}: ${formatDistribution(values.coverClickRate)}`
    },
    retention: {
      stage: "retention",
      title: { zh: "修复首屏兑现", en: "Fix first-screen payoff" },
      summary: { zh: "点击后停留不足，先把结论和证据前置。", en: "Post-click retention is weak; move conclusion and evidence forward." },
      metric: { zh: "平均观看时长中位数", en: "Median view time" },
      action: { zh: "第二页直接兑现封面承诺，每页只保留一个信息任务。", en: "Pay off the cover on slide two and keep one job per slide." },
      evidence: (values, locale) => `${locale === "zh" ? "观看时长 P25/P50/P75" : "View time P25/P50/P75"}: ${formatDistribution(values.averageViewSeconds)}`
    },
    value: {
      stage: "value",
      title: { zh: "增加可收藏价值", en: "Create save-worthy value" },
      summary: { zh: "内容被看见，但收藏与分享不足。", en: "The content is seen but not saved or shared." },
      metric: { zh: "每千观看收藏分享中位数", en: "Median saves and shares per 1K views" },
      action: { zh: "只增加清单、模板、步骤或前后对比中的一种。", en: "Add one of a checklist, template, steps, or before/after proof." },
      evidence: (values, locale) => `${locale === "zh" ? "收藏分享 P25/P50/P75" : "Save/share P25/P50/P75"}: ${formatDistribution(values.saveSharePerThousand)}`
    },
    conversion: {
      stage: "conversion",
      title: { zh: "建立长期关注理由", en: "Create a durable reason to follow" },
      summary: { zh: "内容价值成立，但没有转化为持续关注。", en: "The content creates value but not ongoing audience growth." },
      metric: { zh: "每千观看新增关注中位数", en: "Median followers per 1K views" },
      action: { zh: "让结尾承诺与主页定位保持一致，只调整关注理由。", en: "Align the closing promise with the profile position." },
      evidence: (values, locale) => `${locale === "zh" ? "关注转化 P25/P50/P75" : "Follow conversion P25/P50/P75"}: ${formatDistribution(values.followersPerThousand)}`
    }
  };
  if (sampleSize === 0) return stages.measurement;
  if (distributions.impressions.count === 0) {
    return missingMetricDefinition(
      "曝光",
      "impressions",
      "Add impressions",
      "曝光数据缺失，不能判断选题分发是否成立。",
      "Impression data is missing, so distribution cannot be assessed."
    );
  }
  if (isRelativeLow(representative.impressions, distributions.impressions)) return stages.distribution;
  if (distributions.coverClickRate.count === 0) {
    return missingMetricDefinition(
      "封面点击率或观看量",
      "cover click-through rate or views",
      "Add cover CTR or views",
      "曝光之后缺少点击数据；不会跳过这一层去归因正文或互动。",
      "Click data is missing after distribution; later stages will not be blamed."
    );
  }
  if (isRelativeLow(representative.coverClickRate, distributions.coverClickRate)) return stages.click;
  if (distributions.averageViewSeconds.count === 0) {
    return missingMetricDefinition(
      "平均观看时长",
      "average view duration",
      "Add average view duration",
      "点击之后缺少停留数据；不能直接把问题归到内容价值。",
      "Retention data is missing after the click; content value cannot yet be blamed."
    );
  }
  if (isRelativeLow(representative.averageViewSeconds, distributions.averageViewSeconds)) return stages.retention;
  if (isRelativeLow(representative.saveSharePerThousand, distributions.saveSharePerThousand)) return stages.value;
  if (isRelativeLow(representative.followersPerThousand, distributions.followersPerThousand)) return stages.conversion;
  return {
    stage: "measurement",
    title: { zh: "暂未发现相对异常", en: "No relative outlier yet" },
    summary: {
      zh: "代表笔记没有落入账号自身成熟分布的低位区间，现有数据不足以归因某个漏斗环节。",
      en: "Representative posts do not sit in the low end of this account's mature distribution, so no funnel cause is assigned."
    },
    metric: { zh: "个人成熟笔记分布", en: "Personal mature-post distribution" },
    action: { zh: "保持当前实验，补充同口径样本后再判断。", en: "Keep the current experiment and add comparable samples." },
    evidence: (values, locale) => `${locale === "zh" ? "成熟样本" : "Mature samples"}: ${values.impressions.count}`
  };
}

function metricDistributions(samples: GrowthMetricSample[]): XhsMetricDistributions {
  return {
    impressions: distribution(samples.map((sample) => sample.impressions).filter((value) => value >= 0)),
    coverClickRate: distribution(samples.map(sampleCoverCtr).filter((value) => value >= 0)),
    averageViewSeconds: distribution(samples.map((sample) => sample.averageViewSeconds).filter((value) => value >= 0)),
    saveSharePerThousand: distribution(samples.map((sample) => perThousand(sample.saves + sample.shares, sample.views || sample.clicks)).filter((value) => value >= 0)),
    followersPerThousand: distribution(samples.map((sample) => perThousand(sample.followerGrowth, sample.views || sample.clicks)))
  };
}

function isRelativeLow(representative: XhsDistribution, baseline: XhsDistribution): boolean {
  return representative.median !== null
    && baseline.p25 !== null
    && baseline.p75 !== null
    && baseline.p25 !== baseline.p75
    && representative.median <= baseline.p25;
}

function timestamp(value: string | undefined): number {
  if (!value) return 0;
  const result = new Date(value).getTime();
  return Number.isNaN(result) ? 0 : result;
}

function missingMetricDefinition(
  metricZh: string,
  metricEn: string,
  actionEn: string,
  summaryZh: string,
  summaryEn: string
): XhsBottleneckDefinition {
  return {
    stage: "measurement",
    title: { zh: `先补齐${metricZh}`, en: actionEn },
    summary: { zh: summaryZh, en: summaryEn },
    metric: { zh: metricZh, en: metricEn },
    action: {
      zh: `补录${metricZh}，保持内容不变后再判断。`,
      en: `Add ${metricEn}, keep the content unchanged, and then reassess.`
    },
    evidence: (_values, locale) => locale === "zh" ? `${metricZh}有效样本数为 0。` : `Valid ${metricEn} sample count is 0.`
  };
}

function formatDistribution(value: { p25: number | null; median: number | null; p75: number | null }): string {
  return `${value.p25 ?? "—"} / ${value.median ?? "—"} / ${value.p75 ?? "—"}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
