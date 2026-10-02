
import { NextResponse } from "next/server";
import {
  getOpenPatrolItem,
  listPatrolItems,
  refreshUserPatrol
} from "@/lib/agent/patrol";
import {
  getActiveSubscription,
  getPlanFeatures,
  resolveEffectivePlan
} from "@/lib/payment/entitlements";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Agent patrol requires Supabase." }, { status: 503 });
    }
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 10);
    const [openItem, items, backgroundEligible] = await Promise.all([
      getOpenPatrolItem(admin, userId),
      listPatrolItems(admin, userId, limit),
      userHasBackgroundPatrol(admin, userId)
    ]);
    return NextResponse.json({ openItem, items, backgroundEligible });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to view the Agent duty queue." }, { status: 401 });
    }
    return NextResponse.json(
      { error: resolveErrorMessage(error, "Failed to load the Agent duty queue.") },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    return runScheduledPatrol(authorization);
  }

  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Agent patrol requires Supabase." }, { status: 503 });
    }
    const openItem = await refreshUserPatrol(admin, userId);
    const [items, backgroundEligible] = await Promise.all([
      listPatrolItems(admin, userId, 8),
      userHasBackgroundPatrol(admin, userId)
    ]);
    return NextResponse.json({
      openItem,
      items,
      backgroundEligible,
      refreshedAt: new Date().toISOString()
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to refresh the Agent duty queue." }, { status: 401 });
    }
    return NextResponse.json(
      { error: resolveErrorMessage(error, "Failed to refresh the Agent duty queue.") },
      { status: 400 }
    );
  }
}

async function runScheduledPatrol(authorization: string) {
  const secret = process.env.CRON_PERF_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Agent patrol is not configured." }, { status: 503 });
  }
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  try {
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, plan")
      .limit(2000);
    if (profilesError) throw profilesError;
    const userIds = (profiles ?? []).map((profile) => String(profile.id));
    if (userIds.length === 0) {
      return NextResponse.json({ scanned: 0, refreshed: 0, skipped: 0, failed: 0 });
    }

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("subscriptions")
      .select("user_id, status, current_period_end")
      .in("user_id", userIds)
      .eq("payment_provider", "creem")
      .order("updated_at", { ascending: false });
    if (subscriptionsError) throw subscriptionsError;

    const subscriptionsByUser = new Map<string, Array<{ status: string; currentPeriodEnd?: string | null }>>();
    for (const subscription of subscriptions ?? []) {
      const list = subscriptionsByUser.get(subscription.user_id) ?? [];
      list.push({
        status: String(subscription.status ?? ""),
        currentPeriodEnd: subscription.current_period_end
      });
      subscriptionsByUser.set(subscription.user_id, list);
    }

    let refreshed = 0;
    let skipped = 0;
    let failed = 0;
    for (const profile of profiles ?? []) {
      const userId = String(profile.id);
      const activeSubscription = getActiveSubscription(subscriptionsByUser.get(userId) ?? []);
      const effectivePlan = resolveEffectivePlan(profile.plan, activeSubscription);
      if (!getPlanFeatures(effectivePlan).proactiveMonitoring) {
        skipped += 1;
        continue;
      }
      try {
        await refreshUserPatrol(admin, userId);
        refreshed += 1;
      } catch (error) {
        failed += 1;
        console.error(`[agent/patrol] refresh failed for user=${userId}:`, error);
      }
    }

    return NextResponse.json({
      scanned: profiles?.length ?? 0,
      refreshed,
      skipped,
      failed,
      refreshedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("[agent/patrol] scheduled sweep failed:", error);
    return NextResponse.json(
      { error: resolveErrorMessage(error, "Scheduled Agent patrol failed.") },
      { status: 500 }
    );
  }
}

async function userHasBackgroundPatrol(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string
): Promise<boolean> {
  const [{ data: profile }, { data: subscriptions }] = await Promise.all([
    admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    admin
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", userId)
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
  return getPlanFeatures(effectivePlan).proactiveMonitoring;
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}
