import { z } from "zod";
import type { PlatformId } from "@/lib/platforms";

export const trendSourceSchema = z.enum(["google_trends", "hacker_news", "rss", "aihot", "social_post", "web_search"]);
export type TrendSource = z.infer<typeof trendSourceSchema>;

export const trendLifecycleSchema = z.enum(["new", "rising", "hot", "cooling"]);
export type TrendLifecycle = z.infer<typeof trendLifecycleSchema>;

export const trendWindowSchema = z.enum(["4h", "24h", "7d"]);
export type TrendWindow = z.infer<typeof trendWindowSchema>;

export const trendSourcePreferenceKeySchema = z.enum([
  "google_trends",
  "hacker_news",
  "product_hunt",
  "the_verge",
  "google_ai",
  "sspai",
  "ifanr",
  "baidu_hot_search",
  "baidu_index",
  "wechat_search",
  "reddit",
  "woshipm", "ruanyifeng", "oschina", "ithome", "n8n", "github",
  "xiaohongshu", "bilibili", "weibo", "x", "linkedin", "public_web",
  "aihot"
]);
export type TrendSourcePreferenceKey = z.infer<typeof trendSourcePreferenceKeySchema>;

export const topicOpportunityFeedbackSchema = z.enum([
  "not_relevant",
  "already_knew",
  "brand_mismatch",
  "later"
]);
export type TopicOpportunityFeedback = z.infer<typeof topicOpportunityFeedbackSchema>;

export type TrendSignalInput = {
  ownerUserId?: string;
  scopeKey: string;
  source: TrendSource;
  sourceItemId: string;
  sourceUrl: string;
  sourceLabel: string;
  title: string;
  summary: string;
  locale: string;
  region?: string;
  publishedAt?: string;
  sourceRank?: number;
  sourceScore?: number;
  momentumScore: number;
  evidencePayload: Record<string, unknown>;
  fingerprint: string;
};

export type TrendSourceResult = {
  source: TrendSource;
  label?: string;
  ok: boolean;
  signals: TrendSignalInput[];
  fetchedAt: string;
  notModified?: boolean;
  stateKey?: string;
  retryAfter?: string;
  error?: string;
};

export type TrendSourceFetchState = {
  retryAfter?: string;
  etag?: string;
  lastModified?: string;
};

export const trendCollectionStatusSchema = z.enum([
  "not_started",
  "collecting",
  "ready",
  "degraded",
  "failed"
]);
export type TrendCollectionStatus = z.infer<typeof trendCollectionStatusSchema>;

export interface TrendSourceAdapter {
  readonly id: TrendSource;
  readonly stateKey?: string;
  readonly label?: string;
  collect(state?: TrendSourceFetchState): Promise<TrendSourceResult>;
}

export type TrendEvidence = {
  id: string;
  source: TrendSource;
  sourceLabel: string;
  title: string;
  url: string;
  locale?: string;
  publishedAt: string | null;
  capturedAt: string;
  contentKind?: "trend" | "industry_post" | "peer_post";
  platform?: "reddit";
  author?: string;
  community?: string;
};

export type TrendSuggestion = {
  id: string;
  title: string;
  summary: string;
  lifecycle: TrendLifecycle;
  momentumScore: number;
  freshnessScore: number;
  evidenceConfidence: number;
  sourceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  evidence: TrendEvidence[];
  contentKind?: "trend" | "industry_post" | "peer_post";
  localizedContent?: {
    zh?: {
      title: string;
      summary: string;
    };
  };
};

export type TrendCollectionSourceSummary = {
  source: TrendSource;
  label: string;
  preferenceKey?: TrendSourcePreferenceKey;
  enabled?: boolean;
  fetched: number;
  persisted: number;
  status: "ready" | "unchanged" | "source_failed" | "persistence_failed";
  error?: string;
};

export type MatchDimensions = {
  business?: number;
  audience?: number;
  watchlist?: number;
  platform?: number;
  matchedTerms: string[];
};

export const MIN_ACTIONABLE_MATCH_SCORE = 70;

export function isActionableMatchScore(score: number): boolean {
  return Number.isFinite(score) && score >= MIN_ACTIONABLE_MATCH_SCORE;
}

export type LocalizedOpportunityContent = {
  title: string;
  fact: string;
  whyNow: string;
  whyYou: string;
  recommendedFormat: string;
  mainAngle: string;
  alternateAngles: string[];
  evidenceTitles: Record<string, string>;
};

export type TopicOpportunity = {
  id: string;
  eventId: string;
  title: string;
  fact: string;
  keywords: string[];
  lifecycle: TrendLifecycle;
  matchScore: number;
  rankScore: number;
  matchDimensions: MatchDimensions;
  whyNow: string;
  whyYou: string;
  recommendedPlatform: PlatformId;
  recommendedFormat: string;
  mainAngle: string;
  alternateAngles: string[];
  evidenceConfidence: number;
  analysisStatus: "rules" | "personalized" | "unavailable";
  feedback: TopicOpportunityFeedback | null;
  preparationStatus: "idle" | "confirmed" | "generating" | "ready" | "failed";
  contentKitId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  evidence: TrendEvidence[];
  localizedContent?: {
    zh?: LocalizedOpportunityContent;
  };
};

export type OpportunityRadarResponse = {
  opportunities: TopicOpportunity[];
  trendSuggestions?: TrendSuggestion[];
  trendSuggestionFallbackWindow?: TrendWindow | null;
  window: TrendWindow;
  generatedAt: string;
  collectionStatus: TrendCollectionStatus;
  latestCollectionAt: string | null;
  collectionError: string | null;
  collectionFailureStage?: "source" | "persistence" | "processing" | null;
  checkedSourceCount?: number;
  collectedSignalCount?: number;
  persistedSignalCount?: number;
  collectionSources?: TrendCollectionSourceSummary[];
  latestSignalAt: string | null;
  sourceCount: number;
  profileReady: boolean;
  persisted: boolean;
  localizationStatus: "not_requested" | "ready" | "unavailable";
};

export const TOPIC_OPPORTUNITY_ROW_FIELDS = [
  "id",
  "event_id",
  "match_score",
  "rank_score",
  "match_dimensions",
  "why_now",
  "why_you",
  "recommended_platform",
  "recommended_format",
  "main_angle",
  "alternate_angles",
  "evidence_confidence",
  "analysis_status",
  "analysis_cache_key",
  "analysis_expires_at",
  "feedback",
  "preparation_status",
  "content_kit_id",
  "created_at",
  "updated_at"
].join(",");

export function trendWindowHours(window: TrendWindow): number {
  if (window === "4h") return 4;
  if (window === "7d") return 24 * 7;
  return 24;
}
