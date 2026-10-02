import { getActiveSubscription, getPlanFeatures, resolveEffectivePlan } from "@/lib/payment/entitlements";
import { isAllowedPlatformUrl, isPollablePlatform, type PollablePlatform } from "@/lib/performance-platforms";
import type { PlatformId } from "@/lib/platforms";
import { decryptSecret } from "@/lib/secret-encryption";
import type { createSupabaseAdminClient } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type PerformanceBackfillReason =
  | "platform_unsupported"
  | "published_url_required"
  | "invalid_platform_url"
  | "upgrade_required"
  | "credential_required"
  | "integration_unavailable"
  | "status_unavailable";

export type PerformanceBackfillPlan =
  | {
      mode: "automatic";
      cadenceHours: 3;
      metrics: readonly ["likes", "comments"];
    }
  | {
      mode: "needs_setup" | "manual";
      reason: PerformanceBackfillReason;
    };

export type PerformanceBackfillDecisionInput = {
  platform: PlatformId;
  publishedUrl?: string | null;
  proactiveMonitoring: boolean;
  hasRequiredCredential?: boolean;
  providerConfigured?: boolean;
};

/**
 * The public-metrics poller intentionally promises only the two fields the
 * supported platform endpoints actually expose. This decision stays pure so
 * API routes and tests cannot accidentally drift into claiming impressions,
 * leads, or revenue are collected automatically.
 */
export function decidePerformanceBackfillPlan(
  input: PerformanceBackfillDecisionInput
): PerformanceBackfillPlan {
  if (!isPollablePlatform(input.platform)) {
    return { mode: "manual", reason: "platform_unsupported" };
  }
  const publishedUrl = input.publishedUrl?.trim();
  if (!publishedUrl) {
    return { mode: "needs_setup", reason: "published_url_required" };
  }
  if (!isAllowedPlatformUrl(input.platform, publishedUrl)) {
    return { mode: "needs_setup", reason: "invalid_platform_url" };
  }
  if (!input.proactiveMonitoring) {
    return { mode: "needs_setup", reason: "upgrade_required" };
  }
  if (input.platform === "x" && !input.hasRequiredCredential) {
    return { mode: "needs_setup", reason: "credential_required" };
  }
  if (input.platform === "product-hunt" && !input.providerConfigured) {
    return { mode: "needs_setup", reason: "integration_unavailable" };
  }
  return {
    mode: "automatic",
    cadenceHours: 3,
    metrics: ["likes", "comments"]
  };
}

export async function resolvePerformanceBackfillPlan(
  admin: AdminClient,
  userId: string,
  platform: PlatformId,
  publishedUrl?: string | null
): Promise<PerformanceBackfillPlan> {
  if (!isPollablePlatform(platform) || !publishedUrl?.trim()) {
    return decidePerformanceBackfillPlan({
      platform,
      publishedUrl,
      proactiveMonitoring: false
    });
  }

  const [profileResult, subscriptionsResult, credentialResult] = await Promise.all([
    admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    admin
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", userId)
      .eq("payment_provider", "creem")
      .order("updated_at", { ascending: false }),
    platform === "x"
      ? admin.from("user_integrations").select("x_bearer_token").eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  if (profileResult.error) throw profileResult.error;
  if (subscriptionsResult.error) throw subscriptionsResult.error;
  if (credentialResult.error) throw credentialResult.error;

  const activeSubscription = getActiveSubscription(
    (subscriptionsResult.data ?? []).map((subscription) => ({
      status: String(subscription.status ?? ""),
      currentPeriodEnd: subscription.current_period_end
    }))
  );
  const effectivePlan = resolveEffectivePlan(profileResult.data?.plan, activeSubscription);
  let hasRequiredCredential = platform !== "x";
  if (platform === "x" && credentialResult.data?.x_bearer_token) {
    try {
      hasRequiredCredential = Boolean(
        await decryptSecret(String(credentialResult.data.x_bearer_token))
      );
    } catch {
      hasRequiredCredential = false;
    }
  }

  return decidePerformanceBackfillPlan({
    platform: platform as PollablePlatform,
    publishedUrl,
    proactiveMonitoring: getPlanFeatures(effectivePlan).proactiveMonitoring,
    hasRequiredCredential,
    providerConfigured: platform !== "product-hunt" || Boolean(process.env.PRODUCT_HUNT_API_TOKEN)
  });
}
