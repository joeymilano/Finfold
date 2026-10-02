import { discoveryEnabled, enqueueSignalDiscovery } from "@/lib/signals/service";
import { NextResponse } from "next/server";
import {
  getActiveSubscription,
  getPlanFeatures,
  resolveEffectivePlan
} from "@/lib/payment/entitlements";
import {
  listPublicDemandSignals,
  persistPublicDemandSignals,
  refreshDemandSignalsForKeywords
} from "@/lib/operations/demand-signals";
import { fetchHackerNewsDemandSignals } from "@/lib/agent/public-demand-signals";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type Watchlist = { keywords?: unknown; competitors?: unknown };

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
    const includeDismissed = new URL(request.url).searchParams.get("includeDismissed") === "true";
    const signals = await listPublicDemandSignals(admin, userId, { includeDismissed, limit: 30 });
    return NextResponse.json({ signals }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return demandSignalError(error, "Failed to load public demand signals.");
  }
}
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization) return runScheduledDemandSignalRefresh(authorization);

  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
    if (!(await userCanResearch(admin, userId, "agentTools"))) {
      return NextResponse.json(
        { error: "Public demand research requires a paid Agent plan." },
        { status: 403 }
      );
    }

    if (discoveryEnabled()) {
      const id = await enqueueSignalDiscovery(admin, userId);
      if (!id) return NextResponse.json({ error: "Add your business or watch keywords first." }, { status: 422 });
      return NextResponse.json({ queued: true, discoveryId: id, signals: await listPublicDemandSignals(admin, userId, { limit: 30 }) }, { status: 202 });
    }

    const { data: program, error: programError } = await admin
      .from("operating_programs")
      .select("id, watchlist")
      .eq("user_id", userId)
      .in("status", ["active", "draft", "paused"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (programError) throw programError;
    const keywords = normalizeWatchKeywords(program?.watchlist as Watchlist | null);
    if (!program || keywords.length === 0) {
      return NextResponse.json(
        { error: "Add at least one keyword to the operating brief before refreshing." },
        { status: 400 }
      );
    }

    const refreshed = await refreshDemandSignalsForKeywords(admin, {
      userId,
      operatingProgramId: program.id,
      keywords,
      limit: 20,
      scanLimit: 100
    });
    if (!refreshed.available) {
      return NextResponse.json(
        { error: refreshed.reason ?? "The public source is temporarily unavailable." },
        { status: 502 }
      );
    }
    const signals = await listPublicDemandSignals(admin, userId, { limit: 30 });
    return NextResponse.json({ ...refreshed, signals, refreshedAt: new Date().toISOString() });
  } catch (error) {
    return demandSignalError(error, "Failed to refresh public demand signals.");
  }
}

async function runScheduledDemandSignalRefresh(authorization: string) {
  const secret = process.env.CRON_PERF_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Scheduled demand research is not configured." }, { status: 503 });
  }
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  try {
    if (discoveryEnabled()) return NextResponse.json({ delegated: "signal_discovery", scanned: 0, refreshed: 0, saved: 0 });
    const { data: programs, error: programError } = await admin
      .from("operating_programs")
      .select("id, user_id, watchlist")
      .eq("status", "active")
      .limit(200);
    if (programError) throw programError;
    const candidates = (programs ?? [])
      .map((program) => ({
        id: String(program.id),
        userId: String(program.user_id),
        keywords: normalizeWatchKeywords(program.watchlist as Watchlist | null)
      }))
      .filter((program) => program.keywords.length > 0);
    if (candidates.length === 0) {
      return NextResponse.json({ scanned: 0, refreshed: 0, skipped: 0, failed: 0, saved: 0 });
    }

    const eligibleUserIds = await backgroundEligibleUserIds(
      admin,
      [...new Set(candidates.map((program) => program.userId))]
    );
    const groups = new Map<string, typeof candidates>();
    for (const program of candidates) {
      if (!eligibleUserIds.has(program.userId)) continue;
      const key = program.keywords.map((keyword) => keyword.toLocaleLowerCase("en-US")).sort().join("\u0000");
      const group = groups.get(key) ?? [];
      group.push(program);
      groups.set(key, group);
    }

    let refreshed = 0;
    let failed = 0;
    let saved = 0;
    for (const group of groups.values()) {
      const result = await fetchHackerNewsDemandSignals({
        keywords: group[0].keywords,
        limit: 20,
        scanLimit: 100
      });
      if (!result.available) {
        failed += group.length;
        continue;
      }
      for (const program of group) {
        try {
          saved += await persistPublicDemandSignals(admin, {
            userId: program.userId,
            operatingProgramId: program.id,
            capturedAt: result.capturedAt,
            signals: result.signals
          });
          refreshed += 1;
        } catch (error) {
          failed += 1;
          console.error(`[demand-signals] persist failed for program=${program.id}:`, error);
        }
      }
    }

    return NextResponse.json({
      scanned: candidates.length,
      refreshed,
      skipped: candidates.length - refreshed - failed,
      failed,
      saved,
      refreshedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("[demand-signals] scheduled refresh failed:", error);
    return NextResponse.json({ error: "Scheduled demand research failed." }, { status: 500 });
  }
}

function normalizeWatchKeywords(watchlist: Watchlist | null | undefined): string[] {
  if (!watchlist || !Array.isArray(watchlist.keywords)) return [];
  const normalized = watchlist.keywords
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length >= 2 && value.length <= 50);
  return [...new Map(normalized.map((value) => [value.toLocaleLowerCase("en-US"), value])).values()].slice(0, 8);
}

async function backgroundEligibleUserIds(admin: AdminClient, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const [{ data: profiles, error: profilesError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
    admin.from("profiles").select("id, plan").in("id", userIds),
    admin
      .from("subscriptions")
      .select("user_id, status, current_period_end")
      .in("user_id", userIds)
      .eq("payment_provider", "creem")
      .order("updated_at", { ascending: false })
  ]);
  if (profilesError) throw profilesError;
  if (subscriptionsError) throw subscriptionsError;
  const subscriptionsByUser = new Map<string, Array<{ status: string; currentPeriodEnd?: string | null }>>();
  for (const subscription of subscriptions ?? []) {
    const list = subscriptionsByUser.get(subscription.user_id) ?? [];
    list.push({ status: String(subscription.status ?? ""), currentPeriodEnd: subscription.current_period_end });
    subscriptionsByUser.set(subscription.user_id, list);
  }
  return new Set(
    (profiles ?? [])
      .filter((profile) => {
        const active = getActiveSubscription(subscriptionsByUser.get(profile.id) ?? []);
        return getPlanFeatures(resolveEffectivePlan(profile.plan, active)).proactiveMonitoring;
      })
      .map((profile) => String(profile.id))
  );
}

async function userCanResearch(
  admin: AdminClient,
  userId: string,
  feature: "agentTools"
): Promise<boolean> {
  const [{ data: profile, error: profileError }, { data: subscriptions, error: subscriptionError }] = await Promise.all([
    admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    admin
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", userId)
      .eq("payment_provider", "creem")
      .order("updated_at", { ascending: false })
  ]);
  if (profileError) throw profileError;
  if (subscriptionError) throw subscriptionError;
  const active = getActiveSubscription(
    (subscriptions ?? []).map((subscription) => ({
      status: String(subscription.status ?? ""),
      currentPeriodEnd: subscription.current_period_end
    }))
  );
  return getPlanFeatures(resolveEffectivePlan(profile?.plan, active))[feature];
}

function demandSignalError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Please log in to use public demand research." }, { status: 401 });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 400 }
  );
}
