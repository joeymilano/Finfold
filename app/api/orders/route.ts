import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase";
import { fetchOrderHistory } from "@/lib/payment/orders";
import { apiError } from "@/lib/i18n";

/**
 * GET — the signed-in user's purchase history: every `credit_purchases`
 * row (scan-to-pay plan months, credit packs, legacy 经营码 orders) plus a
 * summary of their current subscription, each order annotated with refund
 * state so the orders page can render the 3-day self-service action inline.
 */
export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();

    const payload = await fetchOrderHistory(userId);
    if (!payload) {
      return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
    }
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: apiError(request.headers, "请先登录", "Please log in.") },
        { status: 401 }
      );
    }
    console.error("[orders] error:", error);
    return NextResponse.json(
      { error: apiError(request.headers, "加载订单记录失败", "Failed to load order history.") },
      { status: 500 }
    );
  }
}
