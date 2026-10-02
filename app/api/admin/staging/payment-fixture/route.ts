import { NextResponse } from "next/server";
import { POST as handleCreemWebhook } from "@/app/api/webhooks/creem/route";
import { requireAdmin } from "@/lib/auth-admin";
import { signHmacSHA256 } from "@/lib/payment/hmac";
import { createSupabaseAdminClient } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type FixtureState = {
  plan: string;
  monthlyLimit: number;
  subscriptionStatus: string | null;
};

type FixtureEvent = {
  id: string;
  eventType: string;
  created_at: number;
  object: Record<string, unknown>;
};

function stagingTarget(): URL {
  const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://invalid.local");
  if (
    process.env.FINFOLD_DEPLOYMENT_ENV !== "staging" ||
    !/(^|[.-])staging([.-]|$)/i.test(appUrl.hostname)
  ) {
    throw new Error("Not Found");
  }
  return appUrl;
}

async function sendSignedEvent(event: FixtureEvent) {
  const secret = process.env.CREEM_WEBHOOK_SECRET;
  if (!secret) throw new Error("Staging webhook secret is unavailable.");

  const payload = JSON.stringify(event);
  const response = await handleCreemWebhook(
    new Request("https://staging.invalid/api/webhooks/creem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "creem-signature": await signHmacSHA256(payload, secret)
      },
      body: payload
    })
  );
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Staging webhook fixture failed with ${response.status}.`
    );
  }
  return body ?? {};
}

async function readFixtureState(
  admin: AdminClient,
  userId: string,
  subscriptionId: string
): Promise<FixtureState> {
  const [{ data: profile, error: profileError }, { data: subscription, error: subscriptionError }] =
    await Promise.all([
      admin.from("profiles").select("plan, monthly_limit").eq("id", userId).maybeSingle(),
      admin
        .from("subscriptions")
        .select("status")
        .eq("provider_subscription_id", subscriptionId)
        .maybeSingle()
    ]);
  if (profileError) throw profileError;
  if (subscriptionError) throw subscriptionError;
  if (!profile) throw new Error("Disposable staging profile was not created.");
  return {
    plan: String(profile.plan ?? ""),
    monthlyLimit: Number(profile.monthly_limit ?? 0),
    subscriptionStatus: subscription?.status ? String(subscription.status) : null
  };
}

export async function POST() {
  try {
    stagingTarget();
  } catch {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  try {
    await requireAdmin();
    const admin = createSupabaseAdminClient();
    if (!admin) throw new Error("Staging persistence is unavailable.");

    const fixtureId = crypto.randomUUID();
    const compactId = fixtureId.replaceAll("-", "");
    const email = `payment-fixture-${compactId}@staging.invalid`;
    const customerId = `cus_staging_${compactId}`;
    const checkoutId = `ch_staging_${compactId}`;
    const subscriptionId = `sub_staging_${compactId}`;
    const eventIds = {
      checkout: `evt_staging_checkout_${compactId}`,
      active: `evt_staging_active_${compactId}`,
      canceled: `evt_staging_canceled_${compactId}`,
      expired: `evt_staging_expired_${compactId}`
    };
    let fixtureUserId: string | null = null;
    let evidence: Record<string, unknown> | null = null;

    try {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: `${crypto.randomUUID()}Aa1!`,
        email_confirm: true
      });
      if (createError) throw createError;
      fixtureUserId = created.user?.id ?? null;
      if (!fixtureUserId) throw new Error("Disposable staging user was not created.");

      const commonSubscription = {
        id: subscriptionId,
        customer: { id: customerId, email },
        current_period_end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { user_id: fixtureUserId, plan: "pro", market: "global" }
      };
      const now = Math.floor(Date.now() / 1000);
      const checkoutEvent: FixtureEvent = {
        id: eventIds.checkout,
        eventType: "checkout.completed",
        created_at: now,
        object: {
          id: checkoutId,
          status: "completed",
          customer: { id: customerId, email },
          metadata: { user_id: fixtureUserId }
        }
      };

      const checkout = await sendSignedEvent(checkoutEvent);
      const checkoutReplay = await sendSignedEvent(checkoutEvent);
      const activeEvent: FixtureEvent = {
        id: eventIds.active,
        eventType: "subscription.active",
        created_at: now,
        object: { ...commonSubscription, status: "active" }
      };
      const active = await sendSignedEvent(activeEvent);
      const activeReplay = await sendSignedEvent(activeEvent);
      const activeState = await readFixtureState(admin, fixtureUserId, subscriptionId);

      const canceled = await sendSignedEvent({
        id: eventIds.canceled,
        eventType: "subscription.canceled",
        created_at: now,
        object: {
          ...commonSubscription,
          status: "canceled",
          canceled_at: new Date().toISOString()
        }
      });
      const canceledState = await readFixtureState(admin, fixtureUserId, subscriptionId);

      const expired = await sendSignedEvent({
        id: eventIds.expired,
        eventType: "subscription.expired",
        created_at: now,
        object: { ...commonSubscription, status: "expired" }
      });
      const expiredState = await readFixtureState(admin, fixtureUserId, subscriptionId);

      evidence = {
        fixtureId,
        checkout,
        checkoutReplay,
        active,
        activeReplay,
        canceled,
        expired,
        activeState,
        canceledState,
        expiredState
      };
    } finally {
      const cleanupErrors: string[] = [];
      const { error: eventCleanupError } = await admin
        .from("webhook_events")
        .delete()
        .in("id", Object.values(eventIds));
      if (eventCleanupError) cleanupErrors.push("webhook events");
      if (fixtureUserId) {
        const { error: userCleanupError } = await admin.auth.admin.deleteUser(fixtureUserId);
        if (userCleanupError) cleanupErrors.push("disposable user");
      }
      if (cleanupErrors.length > 0) {
        throw new Error(`Staging payment fixture cleanup failed: ${cleanupErrors.join(", ")}.`);
      }
    }

    if (!evidence) throw new Error("Staging payment fixture produced no evidence.");
    return NextResponse.json({ ok: true, ...evidence, cleanup: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "Forbidden") {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Please log in." }, { status: 401 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Staging payment fixture failed." }, { status: 500 });
  }
}
