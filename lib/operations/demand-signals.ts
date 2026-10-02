import type { createSupabaseAdminClient } from "@/lib/supabase";
import {
  fetchHackerNewsDemandSignals,
  type PublicDemandSignal
} from "@/lib/agent/public-demand-signals";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type DemandSignalStatus = "new" | "kept" | "dismissed";

export type DemandSignalQueueItem = {
  id: string;
  source: "hacker-news" | "business-discovery";
  sourceItemId: string;
  title: string;
  excerpt: string;
  discussionUrl: string;
  externalUrl: string | null;
  score: number | null;
  comments: number | null;
  publishedAt: string | null;
  matchedKeywords: string[];
  status: DemandSignalStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  reviewedAt: string | null;
};

type DemandSignalRow = {
  id: string;
  source: "hacker-news" | "business-discovery";
  source_item_id: string;
  title: string;
  excerpt: string;
  discussion_url: string;
  external_url: string | null;
  score: number | null;
  comments: number | null;
  published_at: string | null;
  matched_keywords: unknown;
  status: DemandSignalStatus;
  first_seen_at: string;
  last_seen_at: string;
  reviewed_at: string | null;
};

const DEMAND_SIGNAL_FIELDS = [
  "id",
  "source",
  "source_item_id",
  "title",
  "excerpt",
  "discussion_url",
  "external_url",
  "score",
  "comments",
  "published_at",
  "matched_keywords",
  "status",
  "first_seen_at",
  "last_seen_at",
  "reviewed_at"
].join(", ");

function mapSignal(row: DemandSignalRow): DemandSignalQueueItem {
  return {
    id: row.id,
    source: row.source,
    sourceItemId: row.source_item_id,
    title: row.title,
    excerpt: row.excerpt,
    discussionUrl: row.discussion_url,
    externalUrl: row.external_url,
    score: row.score,
    comments: row.comments,
    publishedAt: row.published_at,
    matchedKeywords: Array.isArray(row.matched_keywords)
      ? row.matched_keywords.filter((value): value is string => typeof value === "string")
      : [],
    status: row.status,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    reviewedAt: row.reviewed_at
  };
}

export async function persistPublicDemandSignals(
  admin: AdminClient,
  input: {
    userId: string;
    operatingProgramId?: string | null;
    capturedAt: string;
    signals: PublicDemandSignal[];
  }
): Promise<number> {
  if (input.signals.length === 0) return 0;
  const signals = input.signals.map((signal) => ({
    source_item_id: signal.sourceItemId,
    title: signal.title,
    excerpt: signal.excerpt,
    discussion_url: signal.discussionUrl,
    external_url: signal.externalUrl,
    score: signal.score,
    comments: signal.comments,
    published_at: signal.publishedAt,
    matched_keywords: signal.matchedKeywords
  }));

  const { data, error } = await admin.rpc("ingest_public_demand_signals", {
    p_user_id: input.userId,
    p_operating_program_id: input.operatingProgramId ?? null,
    p_captured_at: input.capturedAt,
    p_signals: signals
  });
  if (error) throw error;
  return typeof data === "number" ? data : Number(data ?? 0);
}

export async function listPublicDemandSignals(
  admin: AdminClient,
  userId: string,
  options: { includeDismissed?: boolean; limit?: number } = {}
): Promise<DemandSignalQueueItem[]> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 20), 1), 50);
  let query = admin
    .from("public_demand_signals")
    .select(DEMAND_SIGNAL_FIELDS)
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (!options.includeDismissed) query = query.neq("status", "dismissed");
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapSignal(row as unknown as DemandSignalRow));
}

export async function reviewPublicDemandSignal(
  admin: AdminClient,
  userId: string,
  signalId: string,
  status: Exclude<DemandSignalStatus, "new">
): Promise<DemandSignalQueueItem> {
  const reviewedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("public_demand_signals")
    .update({ status, reviewed_at: reviewedAt, updated_at: reviewedAt })
    .eq("id", signalId)
    .eq("user_id", userId)
    .select(DEMAND_SIGNAL_FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Demand signal not found.");
  return mapSignal(data as unknown as DemandSignalRow);
}

export async function refreshDemandSignalsForKeywords(
  admin: AdminClient,
  input: {
    userId: string;
    keywords: string[];
    operatingProgramId?: string | null;
    limit?: number;
    scanLimit?: number;
  }
): Promise<{ available: boolean; signalCount: number; savedCount: number; reason?: string }> {
  const result = await fetchHackerNewsDemandSignals({
    keywords: input.keywords,
    limit: input.limit,
    scanLimit: input.scanLimit
  });
  if (!result.available) {
    return { available: false, signalCount: 0, savedCount: 0, reason: result.reason };
  }
  const savedCount = await persistPublicDemandSignals(admin, {
    userId: input.userId,
    operatingProgramId: input.operatingProgramId,
    capturedAt: result.capturedAt,
    signals: result.signals
  });
  return {
    available: true,
    signalCount: result.signals.length,
    savedCount
  };
}
