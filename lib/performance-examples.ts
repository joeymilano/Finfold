import type { createSupabaseAdminClient } from "@/lib/supabase";

export type PerfExample = {
  title: string;
  body: string;
  likes: number;
  comments: number;
  impressions: number;
  views: number;
  coverClickRate: number;
  averageViewSeconds: number;
  saves: number;
  shares: number;
  followerGrowth: number;
};

function performanceScore(example: PerfExample): number {
  return example.likes
    + example.comments * 3
    + example.saves * 4
    + example.shares * 5
    + Math.max(0, example.followerGrowth) * 8
    + example.coverClickRate;
}

function engagement(example: PerfExample): number {
  return example.likes + example.comments * 3 + example.saves * 2 + example.shares * 3;
}

const MIN_SAMPLES_PER_PLATFORM = 2;
const MIN_ABSOLUTE_ENGAGEMENT = 5;
const MAX_EXAMPLES_PER_PLATFORM = 2;
const MAX_BODY_CHARS = 400;
const MAX_ANALYSIS_EXAMPLES_PER_PLATFORM = 3;
const MAX_ANALYSIS_BODY_CHARS = 1_200;

export type HighPerformerOptions = {
  /** Tone review needs a slightly broader reference set than prompt few-shot
   * injection. Defaults preserve the established generation contract. */
  maxExamplesPerPlatform?: number;
  maxBodyChars?: number;
};

/**
 * Fetches this user's own highest-performing past posts, grouped by
 * platform, for use as few-shot examples in the generation prompt
 * (lib/prompts.ts). Returns an empty object when the user has no
 * qualifying history for any of the requested platforms — callers should
 * treat that as "nothing to inject", not an error; a cold-start user must
 * degrade cleanly to the current no-backflow behavior.
 *
 * A platform only contributes examples when it has at least
 * MIN_SAMPLES_PER_PLATFORM measured posts, so a single lucky post is never
 * mistaken for a repeatable pattern — and even the best sample within a
 * platform must clear MIN_ABSOLUTE_ENGAGEMENT, so a platform where "the
 * best" is still de facto zero engagement contributes nothing.
 */
export async function fetchHighPerformers(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string,
  platforms: string[],
  options: HighPerformerOptions = {}
): Promise<Record<string, PerfExample[]>> {
  const maxExamplesPerPlatform = Math.min(
    MAX_ANALYSIS_EXAMPLES_PER_PLATFORM,
    Math.max(1, options.maxExamplesPerPlatform ?? MAX_EXAMPLES_PER_PLATFORM)
  );
  const maxBodyChars = Math.min(
    MAX_ANALYSIS_BODY_CHARS,
    Math.max(1, options.maxBodyChars ?? MAX_BODY_CHARS)
  );
  const extendedMetricsResult = await admin
    .from("performance_metrics")
    .select("platform, likes, comments, saves, shares, impressions, views, cover_click_rate, average_view_seconds, follower_growth, kit_id")
    .eq("user_id", userId)
    .in("platform", platforms);

  let metrics = extendedMetricsResult.data as Array<Record<string, unknown>> | null;
  let metricsError = extendedMetricsResult.error;
  if (metricsError) {
    const legacyMetricsResult = await admin
      .from("performance_metrics")
      .select("platform, likes, comments, kit_id")
      .eq("user_id", userId)
      .in("platform", platforms);
    metrics = legacyMetricsResult.data as Array<Record<string, unknown>> | null;
    metricsError = legacyMetricsResult.error;
  }

  if (metricsError || !metrics || metrics.length === 0) {
    if (metricsError) console.error("[performance-examples] metrics fetch failed:", JSON.stringify(metricsError));
    return {};
  }

  // performance_metrics has no FK to kit_outputs (only to content_kits), so
  // the matching output for each (kit_id, platform) pair must be fetched
  // separately rather than embedded via a PostgREST join.
  const kitIds = Array.from(new Set(metrics.map((m) => String(m.kit_id))));
  const { data: outputs, error: outputsError } = await admin
    .from("kit_outputs")
    .select("kit_id, platform, title, body, final_body")
    .in("kit_id", kitIds)
    .in("platform", platforms);

  if (outputsError || !outputs) {
    if (outputsError) console.error("[performance-examples] outputs fetch failed:", JSON.stringify(outputsError));
    return {};
  }

  const outputByKitPlatform = new Map(
    outputs.map((o) => [`${o.kit_id}:${o.platform}`, o])
  );

  const byPlatform = new Map<string, PerfExample[]>();
  for (const row of metrics) {
    const platform = String(row.platform);
    const output = outputByKitPlatform.get(`${String(row.kit_id)}:${platform}`);
    if (!output) continue;
    const list = byPlatform.get(platform) ?? [];
    list.push({
      title: output.title,
      body: (output.final_body || output.body).slice(0, maxBodyChars),
      likes: Number(row.likes ?? 0),
      comments: Number(row.comments ?? 0),
      impressions: Number(row.impressions ?? 0),
      views: Number(row.views ?? 0),
      coverClickRate: Number(row.cover_click_rate ?? 0),
      averageViewSeconds: Number(row.average_view_seconds ?? 0),
      saves: Number(row.saves ?? 0),
      shares: Number(row.shares ?? 0),
      followerGrowth: Number(row.follower_growth ?? 0)
    });
    byPlatform.set(platform, list);
  }

  const result: Record<string, PerfExample[]> = {};
  for (const [platform, examples] of byPlatform) {
    if (examples.length < MIN_SAMPLES_PER_PLATFORM) continue;

    const sorted = [...examples].sort(
      (a, b) => performanceScore(b) - performanceScore(a)
    );
    const sortedEngagements = sorted.map(engagement);
    const median = percentile(sortedEngagements, 0.5);
    const threshold = Math.max(median, MIN_ABSOLUTE_ENGAGEMENT);

    const qualifying = sorted
      .filter((e) => engagement(e) >= threshold)
      .slice(0, maxExamplesPerPlatform);

    if (qualifying.length > 0) {
      result[platform] = qualifying;
    }
  }

  return result;
}

/** `values` must already be sorted descending. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const idx = Math.min(values.length - 1, Math.floor((1 - p) * values.length));
  return values[idx];
}
