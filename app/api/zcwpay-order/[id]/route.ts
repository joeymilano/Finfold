
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase";
import { apiError } from "@/lib/i18n";
import { getZcwOrder, syncZcwOrderStatus } from "@/lib/payment/zcw-orders";

// GET /api/zcwpay-order/[id] — pay-page polling. Returns the order's local
// view; while pending it also asks the gateway directly and fulfills on a
// paid answer, so the user's own polling completes the order even if the
// async notify callback was lost. Ownership is enforced in the query itself.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const existing = await getZcwOrder(id, userId);
    if (!existing) {
      return NextResponse.json(
        { error: apiError(request.headers, "订单不存在。", "Order not found.") },
        { status: 404 }
      );
    }

    const order = await syncZcwOrderStatus(existing);
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: apiError(request.headers, "请先登录。", "Please log in.") },
        { status: 401 }
      );
    }
    console.error("[zcwpay-order] status check failed:", error);
    return NextResponse.json(
      { error: apiError(request.headers, "查询订单失败。", "Failed to check the order.") },
      { status: 500 }
    );
  }
}
