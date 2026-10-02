
import { NextResponse } from "next/server";
import { distillNegativeRule, mergeNegativeRules } from "@/lib/negative-learning";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { logMemoryEvent } from "@/lib/memory-events";
import { brandBrainSchema, visualIdentitySchema } from "@/lib/brand-brain";
import { learnVisualPreference, mergeVisualPreference, type VisualPerformanceSample } from "@/lib/visual-performance-learning";
import { mergeVisualPerformancePlatformMemory } from "@/lib/platform-memory-performance";
import type { PlatformId } from "@/lib/platforms";
import type { VisualStoryTheme } from "@/lib/visual-story";

const MIN_SAMPLES_PER_GROUP = 4;
const MAX_ABSOLUTE_ENGAGEMENT_FOR_UNDERPERFORMER = 5;
const AUTONOMOUS_AI_CALLS_DISABLED = true;

function engagement(likes: number, comments: number): number {
  return likes + comments * 3;
}

type MetricRow = {
  user_id: string;
  platform: string;
  kit_id: string;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
};

type OutputRow = {
  kit_id: string;
  platform: string;
  title: string;
  body: string;
  final_body: string | null;
};

/**
 * Weekly negative-learning pass, called by the watch-poller Worker's cron
 * (workers/watch-poller/index.ts) on a low-frequency schedule — this is the
 * "other half" of the backflow loop that lib/style-learning.ts started:
 * that one learns from the user's own edits, this one learns from real
 * audience reaction (performance_metrics, migration 022).
 *
 * Auth is the same shared secret as /api/performance/poll
 * (CRON_PERF_SECRET) — both are unattended background jobs derived from
 * the same performance data, so rotating one independently of
 * CRON_WATCH_SECRET (a different job entirely) still makes sense, but
 * splitting this from the poll secret would not.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_PERF_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Performance polling is not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const { data: metrics, error: metricsError } = await admin
      .from("performance_metrics")
      .select("user_id, platform, kit_id, likes, comments, saves, shares");
    if (metricsError) throw metricsError;

    const groups = groupByUserPlatform(metrics ?? []);
    const visualPreferences = await learnVisualPreferences(admin, metrics ?? []);
    if (AUTONOMOUS_AI_CALLS_DISABLED) {
      return NextResponse.json({
        groups: groups.size,
        distilled: 0,
        skipped: groups.size,
        visualPreferences,
        reason: "autonomous_ai_generation_disabled"
      });
    }

    let distilled = 0;
    let skipped = 0;

    // Sequential — this is unattended weekly background work with no user
    // waiting, and each iteration makes an LLM call, so there's no reason
    // to burst them concurrently.
    for (const [key, rows] of groups) {
      if (rows.length < MIN_SAMPLES_PER_GROUP) {
        skipped += 1;
        continue;
      }

      const [userId, platform] = key.split("::");
      const kitIds = rows.map((r) => r.kit_id);

      const { data: outputs, error: outputsError } = await admin
        .from("kit_outputs")
        .select("kit_id, platform, title, body, final_body")
        .in("kit_id", kitIds)
        .eq("platform", platform);
      if (outputsError) {
        console.error(`[performance/distill] outputs fetch failed for ${key}:`, JSON.stringify(outputsError));
        skipped += 1;
        continue;
      }

      const outputByKit = new Map((outputs ?? []).map((o: OutputRow) => [o.kit_id, o]));
      const sorted = [...rows].sort((a, b) => engagement(a.likes, a.comments) - engagement(b.likes, b.comments));
      const quartileSize = Math.max(1, Math.floor(sorted.length / 4));

      const underperformers = sorted
        .slice(0, quartileSize)
        .filter((r) => engagement(r.likes, r.comments) < MAX_ABSOLUTE_ENGAGEMENT_FOR_UNDERPERFORMER)
        .map((r) => outputByKit.get(r.kit_id))
        .filter((o): o is OutputRow => Boolean(o))
        .map((o) => ({ title: o.title, body: (o.final_body || o.body).slice(0, 400) }));

      const topPerformers = sorted
        .slice(-quartileSize)
        .map((r) => outputByKit.get(r.kit_id))
        .filter((o): o is OutputRow => Boolean(o))
        .map((o) => ({ title: o.title, body: (o.final_body || o.body).slice(0, 400) }));

      if (underperformers.length === 0 || topPerformers.length === 0) {
        skipped += 1;
        continue;
      }

      const rule = await distillNegativeRule(underperformers, topPerformers);
      if (!rule) {
        skipped += 1;
        continue;
      }

      const { data: brain } = await admin
        .from("brand_brains")
        .select("learned_negative")
        .eq("user_id", userId)
        .maybeSingle();

      const existingRules: string[] = Array.isArray(brain?.learned_negative) ? brain.learned_negative : [];
      const merged = mergeNegativeRules(existingRules, rule);

      const { error: upsertError } = await admin
        .from("brand_brains")
        .upsert({ user_id: userId, learned_negative: merged, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (upsertError) {
        console.error(`[performance/distill] learned_negative upsert failed for ${key}:`, JSON.stringify(upsertError));
        skipped += 1;
        continue;
      }

      // Distilled from a batch of underperforming posts, not one specific
      // kit, so no source_kit_id — the rule text itself is the record.
      await logMemoryEvent(userId, "negative_rule", rule);
      distilled += 1;
    }

    return NextResponse.json({ groups: groups.size, distilled, skipped, visualPreferences });
  } catch (error) {
    console.error("[performance/distill] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to distill negative rules." },
      { status: 500 }
    );
  }
}

async function learnVisualPreferences(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  metrics: MetricRow[]
): Promise<number> {
  const { data: assets, error } = await admin
    .from("visual_assets")
    .select("user_id, kit_id, platform, metadata")
    .eq("is_current", true);
  if (error) {
    console.error("[performance/distill] visual assets fetch failed:", JSON.stringify(error));
    return 0;
  }

  const metricByKey = new Map(metrics.map((row) => [`${row.user_id}::${row.kit_id}::${row.platform}`, row]));
  const seenKitPlatform = new Set<string>();
  const samplesByGroup = new Map<string, VisualPerformanceSample[]>();

  for (const asset of assets ?? []) {
    const key = `${asset.user_id}::${asset.kit_id}::${asset.platform}`;
    if (seenKitPlatform.has(key)) continue;
    const metric = metricByKey.get(key);
    const theme = visualThemeFromMetadata(asset.metadata);
    if (!metric || !theme) continue;
    seenKitPlatform.add(key);

    const groupKey = `${asset.user_id}::${asset.platform}`;
    const samples = samplesByGroup.get(groupKey) ?? [];
    samples.push({
      platform: asset.platform as PlatformId,
      theme,
      score: metric.likes + metric.comments * 3 + metric.saves * 4 + metric.shares * 5
    });
    samplesByGroup.set(groupKey, samples);
  }

  let learned = 0;
  for (const [key, samples] of samplesByGroup) {
    const preference = learnVisualPreference(samples);
    if (!preference) continue;
    const [userId] = key.split("::");
    const { data: brain, error: brainError } = await admin
      .from("brand_brains")
      .select("visual_identity, platform_memory")
      .eq("user_id", userId)
      .maybeSingle();
    if (brainError) continue;

    const visualIdentity = visualIdentitySchema.parse(brain?.visual_identity ?? {});
    const platformMemory = brandBrainSchema.parse({ platformMemory: brain?.platform_memory }).platformMemory;
    const nextIdentity = {
      ...visualIdentity,
      learnedPreferences: mergeVisualPreference(visualIdentity.learnedPreferences, preference)
    };
    const nextPlatformMemory = mergeVisualPerformancePlatformMemory(platformMemory, preference);
    const { error: saveError } = await admin
      .from("brand_brains")
      .upsert({
        user_id: userId,
        visual_identity: nextIdentity,
        platform_memory: nextPlatformMemory,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
    if (saveError) {
      console.error(`[performance/distill] visual preference save failed for ${key}:`, JSON.stringify(saveError));
      continue;
    }
    const recordedMemory = nextPlatformMemory.find((item) => item.id === `performance-visual:${preference.platform}`);
    const previousMemory = platformMemory.find((item) => item.id === recordedMemory?.id);
    if (recordedMemory && previousMemory?.value !== recordedMemory.value) {
      await logMemoryEvent(userId, "performance_rule", recordedMemory.value);
    }
    learned += 1;
  }
  return learned;
}

function visualThemeFromMetadata(metadata: unknown): VisualStoryTheme | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const theme = (metadata as Record<string, unknown>).theme;
  return theme === "editorial" || theme === "signal" || theme === "field-notes" ? theme : null;
}

function groupByUserPlatform(rows: MetricRow[]): Map<string, MetricRow[]> {
  const groups = new Map<string, MetricRow[]>();
  for (const row of rows) {
    const key = `${row.user_id}::${row.platform}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return groups;
}
