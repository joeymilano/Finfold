
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase";
import { getCreditPack } from "@/lib/payment/types";
import { createQrcodeOrder } from "@/lib/payment/qrcode-orders";

// Starts a 经营码 (Alipay QR) order for a one-off credit top-up pack. Unlike
// /api/credits/checkout (which creates a Creem session and redirects), this
// returns a local orderId — the client routes to /billing/pay/[id] which shows
// the QR code + precise amount and polls for operator confirmation.

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();

    const body = (await request.json().catch(() => ({}))) as { packageId?: string };
    if (!body.packageId) {
      return NextResponse.json({ error: "Missing packageId." }, { status: 400 });
    }

    const pack = getCreditPack(body.packageId);
    if (!pack) {
      return NextResponse.json({ error: "Unknown credit package." }, { status: 400 });
    }

    const order = await createQrcodeOrder(userId, pack.id);

    return NextResponse.json({ orderId: order.id });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Please log in to purchase credits." },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create order." },
      { status: 400 }
    );
  }
}
