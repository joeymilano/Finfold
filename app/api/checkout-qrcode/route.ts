import { NextResponse } from "next/server";
import { apiError } from "@/lib/i18n";
import { getCurrentUserId } from "@/lib/supabase";

// Retired: a static receive code cannot confirm payment or fulfill automatically.
// Keep a closed endpoint for cached clients; never create new manual orders.
export async function POST(request: Request) {
  try {
    await getCurrentUserId();
    return NextResponse.json({
      code: "PAYMENT_CHANNEL_UNAVAILABLE",
      error: apiError(request.headers,
        "支付宝扫码付款已停用，请返回账单选择在线支付。已付款请勿重复支付。",
        "Alipay QR payments are unavailable. Return to billing for online checkout. Do not pay again if already charged.")
    }, { status: 503 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "Unauthorized"
      ? "Please log in." : "Unable to check payment availability." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 503 });
  }
}
