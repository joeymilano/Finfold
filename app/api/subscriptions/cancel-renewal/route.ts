import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { getActiveSubscription } from "@/lib/payment/entitlements";
import { cancelCreemSubscription, retrieveCreemSubscription } from "@/lib/payment/creem-management";

export async function POST() {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Billing is temporarily unavailable." }, { status: 503 });
    // Resolve ownership from the session; never accept a subscription id from the client.
    const { data, error } = await admin.from("subscriptions")
      .select("provider_subscription_id, payment_provider, status, current_period_end")
      .eq("user_id", userId);
    if (error) throw error;
    const subscription = getActiveSubscription((data ?? [])
      .filter((row) => row.payment_provider === "creem")
      .map((row) => ({ ...row, provider: row.payment_provider, currentPeriodEnd: row.current_period_end })));
    if (!subscription?.provider_subscription_id) {
      return NextResponse.json({ error: "No active Creem subscription found. / 未找到有效的 Creem 订阅。" }, { status: 409 });
    }
    const id = subscription.provider_subscription_id;
    const current = await retrieveCreemSubscription(id);
    const result = current.status === "scheduled_cancel" ? current : await cancelCreemSubscription(id, "scheduled");
    const periodEnd = result.current_period_end_date;
    if (result.status !== "scheduled_cancel" || !periodEnd || !Number.isFinite(Date.parse(periodEnd))) {
      throw new Error("Creem has not confirmed cancellation yet. Please refresh and try again. / 尚未确认取消，请刷新后重试。");
    }
    // Keep paid access until period end, even if the webhook arrives later.
    const { error: updateError } = await admin.from("subscriptions")
      .update({ status: "scheduled_cancel", current_period_end: periodEnd, cancel_at: periodEnd, updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("provider_subscription_id", id).eq("payment_provider", "creem");
    if (updateError) throw updateError;
    return NextResponse.json({ status: "scheduled_cancel", currentPeriodEnd: periodEnd });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "Unauthorized";
    return NextResponse.json({ error: unauthorized ? "Please log in to manage renewal." : error instanceof Error ? error.message : "Unable to cancel renewal." }, { status: unauthorized ? 401 : 400 });
  }
}
