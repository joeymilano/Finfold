
import { NextResponse } from "next/server";
import { generateRequestSchema, type ContentKit } from "@/lib/content-schema";
import { fetchLatestFeedEntry } from "@/lib/feed-parser";
import { generateKitOutputs } from "@/lib/llm";
import { persistGeneratedKit } from "@/lib/kit-persistence";
import { mapBrandBrainFromRow } from "@/lib/brand-brain-persistence";
import { getActiveSubscription, getPlanFeatures, getPlanModelTier, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { applyFlywheelExperiment } from "@/lib/flywheel-experiment";

const AUTONOMOUS_AI_CALLS_DISABLED = true;

/**
 * Called by the standalone watch-poller Worker (workers/watch-poller/) on
 * its cron schedule — NOT by a logged-in browser session. The Worker owns
 * the schedule while this route owns the business logic, so the logic lives
 * in one place instead of being duplicated into the Worker.
 *
 * Auth is a shared secret (CRON_WATCH_SECRET), not a Supabase session —
 * there is no user sitting at a browser when this fires.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const secret = process.env.CRON_WATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Watch polling is not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (AUTONOMOUS_AI_CALLS_DISABLED) {
    return NextResponse.json({
      drafted: false,
      reason: "autonomous_ai_generation_disabled"
    });
  }

  const { id } = await params;

  try {
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
    }

    const { data: source, error: sourceError } = await admin
      .from("watch_sources")
      .select("id, user_id, type, url, last_seen_hash, enabled")
      .eq("id", id)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) {
      return NextResponse.json({ error: "Watch source not found." }, { status: 404 });
    }
    if (!source.enabled) {
      return NextResponse.json({ drafted: false, reason: "disabled" });
    }

    // Re-check the plan gate at poll time, not just at creation time — a
    // downgrade after creating a watch source should stop drafting, not
    // just stop new sources from being created.
    const [{ data: profile }, { data: subscriptions }] = await Promise.all([
      admin.from("profiles").select("plan").eq("id", source.user_id).maybeSingle(),
      admin
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", source.user_id)
        .eq("payment_provider", "creem")
        .order("updated_at", { ascending: false })
    ]);
    const activeSubscription = getActiveSubscription(
      (subscriptions ?? []).map((subscription) => ({
        status: String(subscription.status ?? ""),
        currentPeriodEnd: subscription.current_period_end
      }))
    );
    const effectivePlan = resolveEffectivePlan(profile?.plan, activeSubscription);
    if (!getPlanFeatures(effectivePlan).proactiveMonitoring) {
      return NextResponse.json({ drafted: false, reason: "plan_downgraded" });
    }

    const entry = await fetchLatestFeedEntry(source.url);
    if (!entry) {
      await admin.from("watch_sources").update({ last_checked_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ drafted: false, reason: "fetch_failed" });
    }

    const entryHash = await sha256Hex(entry.id);
    if (entryHash === source.last_seen_hash) {
      await admin.from("watch_sources").update({ last_checked_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ drafted: false, reason: "no_new_entry" });
    }

    // New entry — draft a kit from it. Cap platforms at 6 (roughly the
    // Starter/Pro platform ceiling) so an auto-draft doesn't itself run up
    // against a plan's per-kit platform limit; the Digital Employee tier
    // has no such cap (11), but this stays conservative since it's an
    // unattended write, not a user-initiated one.
    const { data: brainRow } = await admin
      .from("brand_brains")
      .select("brand_name, product_description, target_audience, tone_keywords, banned_phrases, approved_examples, competitors, positioning_statement, learned_style, learned_negative, performance_rules")
      .eq("user_id", source.user_id)
      .maybeSingle();
    const brandBrain = mapBrandBrainFromRow(brainRow);

    const ideaText = `${entry.title}\n\n${entry.summary}`.trim();
    if (ideaText.length < 20) {
      await admin.from("watch_sources").update({ last_checked_at: new Date().toISOString(), last_seen_hash: entryHash }).eq("id", id);
      return NextResponse.json({ drafted: false, reason: "entry_too_short" });
    }

    const baseInput = generateRequestSchema.parse({
      ideaText,
      goal: "product-launch",
      persona: "ai-saas",
      platforms: ["x", "linkedin", "reddit", "product-hunt", "indie-hackers", "hacker-news"],
      mediaAssets: [],
      language: "auto",
      brandBrain: brandBrain.brandName || brandBrain.productDescription ? brandBrain : undefined
    });

    // Same backflow experiment as interactive generation (see
    // /api/generate) — this is the same real user's history, just
    // triggered unattended, and excluding it would only shrink the
    // experiment's sample size for no benefit.
    const experiment = await applyFlywheelExperiment(admin, source.user_id, baseInput);
    const input = experiment.input;

    const outputs = await generateKitOutputs(input, { modelTier: getPlanModelTier(effectivePlan) });

    const kit: ContentKit = {
      id: crypto.randomUUID(),
      ideaText: input.ideaText,
      goal: input.goal,
      persona: input.persona,
      platforms: input.platforms,
      mediaAssets: input.mediaAssets,
      outputs: outputs.map((output) => ({ ...output, locked: false, publishStatus: "draft" })),
      status: "saved",
      createdAt: new Date().toISOString()
    };

    await persistGeneratedKit(source.user_id, kit, brandBrain, {
      experimentBucket: experiment.bucket,
      flywheelMeta: experiment.meta
    });

    await admin.from("drafted_kits").insert({
      watch_source_id: id,
      kit_id: kit.id,
      user_id: source.user_id,
      source_entry: entry.title
    });

    await admin
      .from("watch_sources")
      .update({ last_checked_at: new Date().toISOString(), last_seen_hash: entryHash })
      .eq("id", id);

    return NextResponse.json({ drafted: true, kitId: kit.id, entryTitle: entry.title });
  } catch (error) {
    console.error("[watch-sources/check] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check watch source." },
      { status: 500 }
    );
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
