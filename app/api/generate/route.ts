export const runtime = "edge";

import { NextResponse } from "next/server";
import { generateRequestSchema, type ContentKit } from "@/lib/content-schema";
import { generateKitOutputs } from "@/lib/llm";
import { moderateInput } from "@/lib/moderation";
import { saveMockKit } from "@/lib/mock-store";
import { getActiveSubscription, isPaidPlan, isSubscriptionCurrentlyActive } from "@/lib/payment/entitlements";
import { PLAN_MONTHLY_LIMITS } from "@/lib/payment";
import { createSupabaseAdminClient, getCurrentUserId, hasSupabaseConfig } from "@/lib/supabase";

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

    const outputs = await generateKitOutputs(input);
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
      publish_status: output.publishStatus ?? "draft"
    }))
  );

  await supabase.from("usage_events").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    event_name: "kit_generated",
    metadata: { kitId: kit.id, platformCount: kit.platforms.length }
  });
}
