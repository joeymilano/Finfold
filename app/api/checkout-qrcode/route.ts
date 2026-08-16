
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase";
import { QRCODE_PLANS } from "@/lib/payment/qrcode-constants";
import { createQrcodePlanOrder } from "@/lib/payment/qrcode-orders";

// Starts a 经营码 (Alipay QR) order for ONE subscription month of Pricing V2 Starter/Creator.
// Returns a local orderId — the client routes to /billing/pay/[id] which shows
// the QR and polls. Unlike the Creem /api/checkout path (auto-renewing), this
// is a prepayment: the operator confirms receipt → grantQrcodePlan opens the
// plan for 30 days, after which it auto-downgrades (see entitlements/check).
// Only Starter/Creator are eligible (Digital Employee stays on Creem).

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();

    const body = (await request.json().catch(() => ({}))) as { plan?: string };
    if (!body.plan) {
      return NextResponse.json({ error: "Missing plan." }, { status: 400 });
    }
    if (!(body.plan in QRCODE_PLANS)) {
      return NextResponse.json(
        { error: "该套餐暂不支持支付宝付款，请使用信用卡。" },
        { status: 400 }
      );
    }

    const order = await createQrcodePlanOrder(userId, body.plan);

    return NextResponse.json({ orderId: order.id });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Please log in to subscribe." },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create order." },
      { status: 400 }
    );
  }
}
