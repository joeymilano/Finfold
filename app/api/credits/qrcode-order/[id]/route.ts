
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase";
import { getQrcodeOrder } from "@/lib/payment/qrcode-orders";

// Polled by the pay page (/billing/pay/[id]) to learn whether the operator has
// confirmed receipt and credits have been granted. The admin client reads the
// row, but we only hand it back when it belongs to the caller — a 404 for
// anyone else's order (no id enumeration leakage).

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const order = await getQrcodeOrder(id, userId);
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load order." }, { status: 400 });
  }
}
