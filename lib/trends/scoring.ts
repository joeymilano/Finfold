import type { BrandBrain } from "@/lib/brand-brain";
import { platformIdSchema } from "@/lib/content-schema";
import type { OperatingProgram } from "@/lib/operations/program";
import type { PlatformId } from "@/lib/platforms";
import type {
  MatchDimensions,
  TrendLifecycle,
  TrendSignalInput
} from "@/lib/trends/types";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "after", "about",
  "what", "why", "how", "your", "new", "news", "using", "have", "has", "are",
  "一个", "一种", "这个", "那个", "以及", "关于", "如何", "什么", "为什么", "最新"
]);

export type OpportunityProfile = {
  businessText?: string;
  audienceText?: string;
  watchlist?: string[];
  platforms?: PlatformId[];
  platformPerformance?: Partial<Record<PlatformId, number>>;
  preferredPlatform?: PlatformId;
  brandName?: string;
  offerName?: string;
  negativeTerms?: string[];
};

export type HistoricalPerformanceRow = {
  platform: string;
  impressions?: number | null;
  views?: number | null;
  clicks?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
  follower_growth?: number | null;
  leads?: number | null;
  signups?: number | null;
};

export type EventForScoring = {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  lifecycle: TrendLifecycle;
  momentumScore: number;
  freshnessScore: number;
  evidenceConfidence: number;
  sourceCount: number;
};

export type OpportunityScore = {
  matchScore: number;
  rankScore: number;
  dimensions: MatchDimensions;
  whyNow: string;
  whyYou: string;
  recommendedPlatform: PlatformId;
  recommendedFormat: string;
  mainAngle: string;
  alternateAngles: string[];
};

export function normalizeTrendText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTrendTerms(value: string, limit = 18): string[] {
  const normalized = normalizeTrendText(value);
  const latin = normalized
    .split(" ")
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  const cjkRuns = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  const cjk = cjkRuns.flatMap((run) => {
    const terms: string[] = [];
    for (let index = 0; index < run.length - 1; index += 1) terms.push(run.slice(index, index + 2));
    return terms;
  });
  return [...new Set([...latin, ...cjk])].slice(0, limit);
}

export function trendSimilarity(left: string, right: string): number {
  const a = new Set(extractTrendTerms(left, 40));
  const b = new Set(extractTrendTerms(right, 40));
  if (!a.size || !b.size) return normalizeTrendText(left) === normalizeTrendText(right) ? 1 : 0;
  const overlap = [...a].filter((term) => b.has(term)).length;
  return overlap / (a.size + b.size - overlap);
}

export function stableTrendFingerprint(value: string): string {
  const normalized = normalizeTrendText(value);
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildOpportunityProfile(input: {
  brain?: BrandBrain | null;
  program?: OperatingProgram | null;
  platforms?: PlatformId[];
  platformPerformance?: Partial<Record<PlatformId, number>>;
}): OpportunityProfile {
  const { brain, program } = input;
  const watchlist = [
    ...(program?.watchlist.keywords ?? []),
    ...(program?.watchlist.competitors ?? []),
    ...(brain?.competitors ?? [])
  ];
  const preferredPlatform = mapOperatingPlatform(program?.platform);
  return {
    businessText: compact([
      brain?.brandName,
      brain?.productDescription,
      brain?.positioningStatement,
      program?.offer.name,
      program?.offer.summary
    ]),
    audienceText: compact([
      brain?.targetAudience,
      program?.audience.description,
      program?.audience.primaryNeed,
      ...(program?.audience.purchaseBarriers ?? [])
    ]),
    watchlist: [...new Set(watchlist.map((item) => item.trim()).filter(Boolean))],
    platforms: input.platforms,
    platformPerformance: input.platformPerformance,
    preferredPlatform,
    brandName: brain?.brandName || undefined,
    offerName: program?.offer.name || undefined
  };
}

export function scoreOpportunity(event: EventForScoring, profile: OpportunityProfile): OpportunityScore {
  const eventText = `${event.title} ${event.summary} ${event.keywords.join(" ")}`;
  const dimensions: MatchDimensions = { matchedTerms: [] };
  const weighted: Array<{ value: number; weight: number }> = [];

  if (profile.businessText) {
    dimensions.business = relevanceScore(eventText, profile.businessText);
    weighted.push({ value: dimensions.business, weight: 35 });
  }
  if (profile.audienceText) {
    dimensions.audience = relevanceScore(eventText, profile.audienceText);
    weighted.push({ value: dimensions.audience, weight: 25 });
  }
  if (profile.watchlist?.length) {
    const matched = profile.watchlist.filter((term) => containsTerm(eventText, term));
    dimensions.matchedTerms = matched.slice(0, 5);
    dimensions.watchlist = clamp(Math.round(matched.length / Math.min(3, profile.watchlist.length) * 100));
    weighted.push({ value: dimensions.watchlist, weight: 20 });
  }
  const recommended = choosePlatform(profile);
  const historicalPlatformScore = profile.platformPerformance?.[recommended];
  if (typeof historicalPlatformScore === "number") {
    dimensions.platform = historicalPlatformScore;
    weighted.push({ value: dimensions.platform, weight: 20 });
  }

  const rawMatchScore = weighted.length
    ? Math.round(weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / weighted.reduce((sum, item) => sum + item.weight, 0))
    : 0;
  const feedbackPenalty = (profile.negativeTerms ?? []).filter((term) => containsTerm(eventText, term)).length * 12;
  const matchScore = clamp(rawMatchScore - Math.min(30, feedbackPenalty));
  const rankScore = clampDecimal(
    matchScore * 0.45
      + event.momentumScore * 0.30
      + event.freshnessScore * 0.15
      + event.evidenceConfidence * 0.10
  );
  const platform = recommended;
  const audience = profile.offerName || profile.brandName || "你的业务";
  const matchedTerms = dimensions.matchedTerms;
  const whyYou = matchedTerms.length
    ? `它直接命中你关注的「${matchedTerms.join("、")}」，可以自然连接到${audience}。`
    : matchScore >= 55
      ? `它与${audience}的定位和受众存在明确交集，适合用你的专业判断切入。`
      : `当前只有有限的业务交集，建议先核对角度再投入创作。`;

  return {
    matchScore,
    rankScore,
    dimensions,
    whyNow: buildWhyNow(event),
    whyYou,
    recommendedPlatform: platform,
    recommendedFormat: formatForPlatform(platform),
    mainAngle: `从${audience}的视角，解释「${event.title}」真正会改变什么`,
    alternateAngles: [
      `拆解「${event.title}」背后的机会与误区`,
      `给目标用户一份关于「${event.title}」的行动清单`
    ]
  };
}

/**
 * Turns the user's own measured post history into a bounded platform signal.
 * A missing platform has no score at all; a persisted row containing zeros is
 * a real observed zero. This lets the caller re-normalize absent dimensions
 * without confusing missing history with poor history.
 */
export function scoreHistoricalPlatformPerformance(
  rows: HistoricalPerformanceRow[]
): Partial<Record<PlatformId, number>> {
  const aggregates = new Map<PlatformId, {
    reach: number;
    engagement: number;
    outcomes: number;
  }>();
  for (const row of rows) {
    const parsed = platformIdSchema.safeParse(row.platform);
    if (!parsed.success) continue;
    const current = aggregates.get(parsed.data) ?? { reach: 0, engagement: 0, outcomes: 0 };
    const reach = Math.max(numberOrZero(row.impressions), numberOrZero(row.views), numberOrZero(row.clicks));
    current.reach += reach;
    current.engagement += numberOrZero(row.likes)
      + numberOrZero(row.comments) * 2
      + numberOrZero(row.saves) * 3
      + numberOrZero(row.shares) * 4;
    current.outcomes += numberOrZero(row.follower_growth) * 2
      + numberOrZero(row.leads) * 6
      + numberOrZero(row.signups) * 10;
    aggregates.set(parsed.data, current);
  }

  const result: Partial<Record<PlatformId, number>> = {};
  for (const [platform, aggregate] of aggregates) {
    const perThousand = aggregate.reach > 0
      ? ((aggregate.engagement + aggregate.outcomes) / aggregate.reach) * 1_000
      : 0;
    const sampleScore = Math.min(25, Math.log10(aggregate.reach + 1) * 5);
    const qualityScore = Math.min(55, Math.log10(perThousand + 1) * 15);
    const outcomeScore = Math.min(20, Math.log10(aggregate.outcomes + 1) * 7);
    result[platform] = clampDecimal(sampleScore + qualityScore + outcomeScore);
  }
  return result;
}

export function deriveLifecycle(input: {
  firstSeenAt: string;
  lastSeenAt: string;
  now?: Date;
  momentumScore: number;
  sourceCount: number;
}): TrendLifecycle {
  const now = input.now ?? new Date();
  const ageHours = (now.getTime() - Date.parse(input.firstSeenAt)) / 3_600_000;
  const staleHours = (now.getTime() - Date.parse(input.lastSeenAt)) / 3_600_000;
  if (staleHours >= 6) return "cooling";
  if (input.sourceCount >= 2 && input.momentumScore >= 72) return "hot";
  if (ageHours <= 2) return "new";
  return input.momentumScore >= 48 ? "rising" : "new";
}

export function freshnessScore(lastSeenAt: string, now = new Date()): number {
  const hours = Math.max(0, (now.getTime() - Date.parse(lastSeenAt)) / 3_600_000);
  return clampDecimal(100 * Math.exp(-hours / 28));
}

export function evidenceConfidence(signals: Array<Pick<TrendSignalInput, "source" | "sourceUrl"> & { sourceLabel?: string }>): number {
  const sources = new Set(signals.map((signal) => signal.sourceLabel ? `${signal.source}:${signal.sourceLabel}` : signal.source));
  const urls = new Set(signals.map((signal) => signal.sourceUrl));
  return clamp(Math.min(96, 46 + sources.size * 18 + Math.min(3, urls.size - 1) * 8));
}

function relevanceScore(eventText: string, profileText: string): number {
  const eventTerms = new Set(extractTrendTerms(eventText, 60));
  const profileTerms = extractTrendTerms(profileText, 60);
  if (!profileTerms.length) return 0;
  const matches = profileTerms.filter((term) => eventTerms.has(term) || normalizeTrendText(eventText).includes(term));
  return clamp(Math.round(matches.length / Math.min(6, profileTerms.length) * 100));
}

function containsTerm(text: string, term: string): boolean {
  const normalizedTerm = normalizeTrendText(term);
  return normalizedTerm.length >= 2 && normalizeTrendText(text).includes(normalizedTerm);
}

function choosePlatform(profile: OpportunityProfile): PlatformId {
  if (profile.preferredPlatform) return profile.preferredPlatform;
  const activePlatforms = profile.platforms ?? [];
  const bestActive = [...activePlatforms].sort((left, right) =>
    (profile.platformPerformance?.[right] ?? -1) - (profile.platformPerformance?.[left] ?? -1)
  )[0];
  if (bestActive) return bestActive;
  const bestMeasured = Object.entries(profile.platformPerformance ?? {})
    .filter((entry): entry is [PlatformId, number] => typeof entry[1] === "number")
    .sort((left, right) => right[1] - left[1])[0]?.[0];
  return bestMeasured ?? "xiaohongshu";
}

function mapOperatingPlatform(platform?: string): PlatformId | undefined {
  if (platform === "xiaohongshu" || platform === "linkedin" || platform === "wechat") return platform;
  return undefined;
}

function formatForPlatform(platform: PlatformId): string {
  if (platform === "xiaohongshu") return "观点图文";
  if (platform === "wechat") return "深度解读";
  if (platform === "linkedin") return "专业观点短文";
  if (platform === "x") return "即时观点 Thread";
  return "热点观点帖";
}

function buildWhyNow(event: EventForScoring): string {
  const sourceText = event.sourceCount > 1 ? `${event.sourceCount} 个独立来源正在共同升温` : "最新公开信号刚刚出现";
  if (event.lifecycle === "hot") return `${sourceText}，当前处于高热窗口。`;
  if (event.lifecycle === "rising") return `${sourceText}，讨论仍在上升。`;
  if (event.lifecycle === "cooling") return "讨论开始降温，只适合有明确新观点时跟进。";
  return `${sourceText}，适合尽早建立第一批解释权。`;
}

function compact(values: Array<string | undefined>): string | undefined {
  const result = values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)).join(" ");
  return result || undefined;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function clampDecimal(value: number): number {
  return Math.round(clamp(value) * 100) / 100;
}

function numberOrZero(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}
