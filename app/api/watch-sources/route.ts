
import { NextResponse } from "next/server";
import { apiError } from "@/lib/i18n";
import { z } from "zod";
import { getActiveSubscription, getPlanFeatures, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { validateExternalHttpUrl } from "@/lib/safe-url";

const createSchema = z.object({
  type: z.enum(["rss", "changelog", "github_releases"]),
  url: z.string().url(),
  label: z.string().max(80).default("")
});

async function requireProactiveMonitoring(userId: string, admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>): Promise<boolean> {
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

/** Lists the caller's watch sources. */
export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Update monitoring") }, { status: 503 });
    }

    const { data, error } = await admin
      .from("watch_sources")
      .select("id, type, url, label, enabled, last_checked_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ sources: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "请先登录。", "Please log in.") }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : apiError(request.headers, "暂时无法加载监测源。", "Failed to load watch sources.") }, { status: 400 });
  }
}

/**
 * Creates a watch source (Digital Employee tier only). Actual polling
 * happens in a separate Cloudflare Worker with its own cron trigger — see
 * workers/watch-poller/ — so scheduled failures stay isolated from
 * interactive traffic. This route only manages the row;
 * POST /api/watch-sources/[id]/check is what the Worker calls on each poll.
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = createSchema.parse(await request.json());
    const safeUrl = validateExternalHttpUrl(input.url).toString();

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Update monitoring") }, { status: 503 });
    }

    if (!(await requireProactiveMonitoring(userId, admin))) {
      return NextResponse.json(
        { error: apiError(request.headers, "更新监测需要数字员工套餐。", "Update monitoring requires the Digital Employee plan.") },
        { status: 403 }
      );
    }

    const { data, error } = await admin
      .from("watch_sources")
      .insert({ user_id: userId, type: input.type, url: safeUrl, label: input.label })
      .select("id, type, url, label, enabled, created_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ source: data });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "请先登录。", "Please log in.") }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : apiError(request.headers, "暂时无法创建监测源。", "Failed to create watch source.") }, { status: 400 });
  }
}
