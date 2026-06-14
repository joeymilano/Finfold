export const runtime = "edge";

import { NextResponse } from "next/server";
import { generateRequestSchema, type ContentKit, type KitOutput } from "@/lib/content-schema";
import { generateKitOutputs } from "@/lib/llm";
import { moderateInput } from "@/lib/moderation";
import { saveMockKit } from "@/lib/mock-store";
import { getActiveSubscription, isPaidPlan, isSubscriptionCurrentlyActive } from "@/lib/payment/entitlements";
import { PLAN_MONTHLY_LIMITS } from "@/lib/payment";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUserId, hasSupabaseConfig } from "@/lib/supabase";
import { createLettaAgent, getLettaAgent, isLettaConfigured } from "@/lib/letta";
import { isImageGenConfigured } from "@/lib/image-gen";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = await request.json();
    const input = generateRequestSchema.parse(body);

    const quota = await getUsageAllowance(userId);
    if (quota.used >= quota.limit) {
      return NextResponse.json(
        {
          error: "本月已用完 · 升级继续使用 — Monthly free limit reached. Upgrade to keep generating content kits."
        },
        { status: 402 }
      );
    }

    const moderation = moderateInput(input.ideaText);
    if (moderation.flagged) {
      return NextResponse.json({ error: moderation.reason }, { status: 422 });
    }

    // Resolve the user's Letta agent ID (if Letta is configured)
    const lettaAgentId = await resolveLettaAgentId(userId);

    const outputs = await generateKitOutputs(input, lettaAgentId ?? undefined);

    // ── Generate cover images for each output ──────────────────────
    const outputsWithImages = await enrichWithImages(outputs, input.ideaText);

    const kit: ContentKit = {
      id: crypto.randomUUID(),
      ideaText: input.ideaText,
      goal: input.goal,
      persona: input.persona,
      platforms: input.platforms,
      mediaAssets: input.mediaAssets,
      outputs: outputsWithImages.map((output) => ({ ...output, locked: false, publishStatus: "draft" })),
      status: "saved",
      createdAt: new Date().toISOString()
    };

    await persistKit(userId, kit);
    return NextResponse.json({ kit, allowance: { ...quota, used: quota.used + 1 } });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to generate content kits." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate content kit." },
      { status: 400 }
    );
  }
}

async function getUsageAllowance(userId: string): Promise<{ used: number; limit: number; plan: string }> {
  if (!hasSupabaseConfig()) {
    return { used: 0, limit: 5, plan: "local" };
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return { used: 0, limit: 5, plan: "local" };
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [{ data: profile }, { data: subscriptions }, { count }] = await Promise.all([
    supabase.from("profiles").select("plan, monthly_limit").eq("id", userId).maybeSingle(),
    supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", userId)
      .eq("payment_provider", "creem")
      .order("updated_at", { ascending: false }),
    supabase
      .from("content_kits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart.toISOString())
  ]);

  const plan = String(profile?.plan ?? "free");
  const activeSubscription = getActiveSubscription(
    (subscriptions ?? []).map((subscription) => ({
      status: String(subscription.status ?? ""),
      currentPeriodEnd: subscription.current_period_end
    }))
  );
  const hasPaidAllowance = isPaidPlan(plan) && isSubscriptionCurrentlyActive(activeSubscription);

  return {
    used: count ?? 0,
    limit: hasPaidAllowance ? Number(profile?.monthly_limit ?? PLAN_MONTHLY_LIMITS.free) : PLAN_MONTHLY_LIMITS.free,
    plan: hasPaidAllowance ? plan : "free"
  };
}

async function persistKit(userId: string, kit: ContentKit) {
  saveMockKit(kit);

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  await supabase.from("content_kits").insert({
    id: kit.id,
    user_id: userId,
    idea_text: kit.ideaText,
    goal: kit.goal,
    persona: kit.persona,
    platforms: kit.platforms,
    media_assets: kit.mediaAssets,
    status: kit.status,
    created_at: kit.createdAt
  });

  await supabase.from("kit_outputs").insert(
    kit.outputs.map((output) => ({
      id: crypto.randomUUID(),
      kit_id: kit.id,
      user_id: userId,
      platform: output.platform,
      title: output.title,
      body: output.body,
      cta: output.cta,
      notes: output.notes,
      strategy: output.strategy,
      locked: output.locked ?? false,
      publish_status: output.publishStatus ?? "draft",
      image_url: output.imageUrl || null,
      image_prompt: output.imagePrompt || null
    }))
  );

  await supabase.from("usage_events").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    event_name: "kit_generated",
    metadata: { kitId: kit.id, platformCount: kit.platforms.length }
  });
}

/**
 * Resolve the Letta agent ID for a user.
 * Checks the user_agents table first, then user_metadata.
 * If an agent ID is found but is stale (Letta 404/429), clears it and
 * creates a fresh agent so the generate call never hits a dead agent.
 * Returns null if Letta is not configured.
 */
async function resolveLettaAgentId(userId: string): Promise<string | null> {
  if (!isLettaConfigured()) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();

  // Collect candidate agent ID from DB or metadata
  let agentId: string | null = null;

  if (admin) {
    const { data: mapping } = await admin
      .from("user_agents")
      .select("letta_agent_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (mapping?.letta_agent_id) {
      agentId = mapping.letta_agent_id;
    }
  }

  if (!agentId && supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.user_metadata?.letta_agent_id) {
      agentId = user.user_metadata.letta_agent_id as string;
    }
  }

  // Validate the agent is still live on Letta
  if (agentId) {
    try {
      await getLettaAgent(agentId);
      return agentId; // still valid
    } catch {
      // Stale / deleted agent — clear mapping and fall through to recreate
      if (admin) {
        await admin.from("user_agents").delete().eq("user_id", userId);
      }
      if (supabase) {
        await supabase.auth.updateUser({ data: { letta_agent_id: null } });
      }
      agentId = null;
    }
  }

  // No valid agent — create a fresh one
  try {
    let userEmail = "";
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      userEmail = user?.email ?? "";
    }
    const newAgent = await createLettaAgent(userId, userEmail);

    if (admin) {
      await admin.from("user_agents").upsert(
        { user_id: userId, letta_agent_id: newAgent.id, letta_agent_name: newAgent.name },
        { onConflict: "user_id" }
      );
    }
    if (supabase) {
      await supabase.auth.updateUser({ data: { letta_agent_id: newAgent.id } });
    }

    return newAgent.id;
  } catch {
    // Letta unavailable — return null so generateKitOutputs skips Letta path
    return null;
  }
}

/**
 * Enrich content kit outputs with AI-generated cover images.
 *
 * For each output that has an `imagePrompt` (generated by the LLM),
 * call the image generation API to produce a cover image.
 * If image generation is not configured or fails, the output is
 * returned without an image (graceful degradation).
 */
async function enrichWithImages(
  outputs: KitOutput[],
  ideaText: string
): Promise<KitOutput[]> {
  if (!isImageGenConfigured()) {
    return outputs;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Generate images in parallel (max 3 concurrent)
  const BATCH_SIZE = 3;
  const results: KitOutput[] = [];

  for (let i = 0; i < outputs.length; i += BATCH_SIZE) {
    const batch = outputs.slice(i, i + BATCH_SIZE);
    const enriched = await Promise.allSettled(
      batch.map(async (output) => {
        // Use the LLM-generated imagePrompt, or fall back to a prompt
        // derived from the output title and ideaText
        const prompt = output.imagePrompt || `${output.title}. ${ideaText}. Professional social media cover image, eye-catching, modern design.`;

        try {
          const res = await fetch(`${baseUrl}/api/image/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, platform: output.platform }),
          });

          if (!res.ok) {
            console.warn(`[generate] Image generation failed for ${output.platform}: ${res.status}`);
            return output;
          }

          const data = (await res.json()) as { url?: string; error?: string };
          if (data.url) {
            return { ...output, imageUrl: data.url, imagePrompt: prompt };
          }
          return output;
        } catch (error) {
          console.warn(`[generate] Image generation error for ${output.platform}:`, error instanceof Error ? error.message : String(error));
          return output;
        }
      })
    );

    for (const r of enriched) {
      if (r.status === "fulfilled") {
        results.push(r.value);
      }
    }
  }

  return results;
}
