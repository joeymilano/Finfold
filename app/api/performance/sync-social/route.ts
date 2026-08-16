import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { getSocialAdapter } from "@/lib/social-adapters";
import { getSocialConnectionCredentials } from "@/lib/social-connections";
import { getSocialOAuthProvider } from "@/lib/social-oauth";
import { persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const requestSchema = z.object({
  connectorId: z.literal("linkedin")
});

const LINKEDIN_PLATFORM = "linkedin";

/**
 * Imports read-only performance data for a connected social account (pilot:
 * LinkedIn). Each synced post becomes a "synced" content_kit so the data lands
 * in the existing performance_metrics pipeline without a schema change. Re-runs
 * upsert metrics for already-imported posts instead of duplicating kits.
 */
export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, {
    scope: "performance:sync-social",
    limit: 10,
    windowMs: 15 * 60 * 1_000
  });
  if (rateLimited) return rateLimited;

  try {
    const userId = await getCurrentUserId();
    const body = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) {
      return NextResponse.json({ error: "Unsupported connector." }, { status: 400 });
    }
    const connectorId = body.data.connectorId;

    if (!getSocialOAuthProvider(connectorId)) {
      return NextResponse.json({ error: "This social connection is not configured." }, { status: 503 });
    }

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Performance sync") }, { status: 503 });
    }

    const credentials = await getSocialConnectionCredentials(admin, userId, connectorId);
    if (!credentials) {
      return NextResponse.json({ error: "Connect the account before syncing performance." }, { status: 409 });
    }

    const adapter = getSocialAdapter(connectorId);

    const postsResult = await adapter.listOwnedPosts(credentials);
    if (postsResult.kind !== "ok") {
      return NextResponse.json({ error: postsResult.reason }, { status: 502 });
    }
    const postByUrn = new Map(postsResult.value.map((post) => [post.externalPostId, post]));

    const metricsResult = await adapter.pollPostMetrics(credentials);
    if (metricsResult.kind !== "ok") {
      return NextResponse.json({ error: metricsResult.reason }, { status: 502 });
    }

    // Idempotency: reuse the kit_id for LinkedIn posts imported on a previous run.
    const { data: existing, error: existingError } = await admin
      .from("performance_metrics")
      .select("kit_id, published_url")
      .eq("user_id", userId)
      .eq("platform", LINKEDIN_PLATFORM);
    if (existingError) throw existingError;
    const kitIdByUrn = new Map<string, string>();
    for (const row of existing ?? []) {
      if (row.published_url) kitIdByUrn.set(row.published_url, row.kit_id);
    }

    let created = 0;
    let updated = 0;
    for (const metric of metricsResult.value) {
      const urn = metric.externalPostId;
      const post = postByUrn.get(urn);
      let kitId = kitIdByUrn.get(urn);

      if (!kitId) {
        const { data: kitRow, error: kitError } = await admin
          .from("content_kits")
          .insert({
            user_id: userId,
            idea_text: post?.text?.slice(0, 500) || urn,
            goal: "Imported from LinkedIn",
            persona: "LinkedIn audience",
            platforms: [LINKEDIN_PLATFORM],
            status: "published"
          })
          .select("id")
          .single();
        if (kitError) throw kitError;
        kitId = kitRow.id;
        created += 1;
      } else {
        updated += 1;
      }

      const { error: metricsError } = await admin.from("performance_metrics").upsert({
        kit_id: kitId,
        user_id: userId,
        platform: LINKEDIN_PLATFORM,
        impressions: metric.impressions ?? 0,
        views: 0,
        clicks: 0,
        cover_click_rate: 0,
        average_view_seconds: 0,
        likes: metric.reactions ?? 0,
        comments: metric.comments ?? 0,
        saves: 0,
        shares: 0,
        follower_growth: 0,
        profile_visits: 0,
        leads: 0,
        signups: 0,
        revenue: 0,
        published_url: urn,
        measured_at: metric.polledAt,
        source: "auto"
      }, { onConflict: "kit_id,platform" });
      if (metricsError) throw metricsError;
    }

    return NextResponse.json({ imported: created + updated, created, updated });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to sync performance." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync performance." },
      { status: 400 }
    );
  }
}
