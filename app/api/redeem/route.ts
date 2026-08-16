
import { NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";
import { ensurePlanCredits } from "@/lib/payment/credits";
import { isPaidPlan } from "@/lib/payment/entitlements";

/**
 * POST /api/redeem  { code: string }
 *
 * Redeems an activation/coupon code for the signed-in user. Codes are
 * single-use by default, while explicitly configured campaign codes can have
 * a bounded multi-use limit. Validity, per-user uniqueness, campaign limits,
 * expiry, free-users-only access, and entitlement writes all happen atomically
 * inside redeem_activation_code(). This route only authenticates the caller
 * and maps the function's status string to a response.
 */
export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";

  // Normalized codes are short alphanumerics (plus dashes); reject anything
  // else before hitting the DB so we never pass junk into the function.
  if (!code || code.length > 64 || !/^[A-Z0-9-]+$/.test(code)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const { data, error } = await admin.rpc("redeem_activation_code", {
    p_code: code,
    p_user_id: user.id
  });

  if (error) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const result = typeof data === "string" ? data : "";

  if (result.startsWith("ok:")) {
    const [, plan, days] = result.split(":");
    if (!isPaidPlan(plan)) {
      console.error("[redeem] Activation-code RPC returned an unsupported plan.");
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }

    // The activation-code RPC predates the credits ledger and only updates
    // profiles/subscriptions. Grant the current cycle immediately so a newly
    // activated account is ledger-complete before its first entitlement read.
    // grant_plan_credits is idempotent for (user, period), so retries cannot
    // double-issue credits.
    try {
      await ensurePlanCredits(user.id, plan);
    } catch (creditError) {
      // Redemption itself is already committed. Keep the successful response
      // (the next entitlement read also repairs the idempotent grant), but make
      // the incomplete eager grant visible to scheduled reconciliation/logs.
      console.error(
        "[redeem] Activation succeeded but the eager credit grant failed:",
        creditError instanceof Error ? creditError.name : "UnknownError"
      );
    }
    return NextResponse.json({ ok: true, plan, days: Number(days) });
  }

  // Map the function's status strings to a 400 with a stable machine code the
  // client turns into a localized message.
  const known = new Set(["invalid", "already_used", "redemption_limit_reached", "expired", "already_subscribed"]);
  const reason = known.has(result) ? result : "invalid";
  return NextResponse.json({ error: reason }, { status: 400 });
}
