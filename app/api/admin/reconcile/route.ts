
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import {
  confirmQrcodeOrder,
  listQrcodeOrders,
  voidQrcodeOrder
} from "@/lib/payment/qrcode-orders";

// Admin reconcile surface for 经营码 (Alipay QR) orders. GET lists orders;
// POST {action:"confirm"|"void", orderId} confirms receipt (grants credits via
// grant_purchase_credits) or voids an unwanted/expired order. Admin-only.

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const status =
      statusParam === "paid" || statusParam === "all" ? statusParam : "pending";

    const orders = await listQrcodeOrders({ status, limit: 100 });
    return NextResponse.json({ orders });
  } catch (error) {
    return adminError(error);
  }
}

export async function POST(request: Request) {
  try {
    const adminId = await requireAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      action?: "confirm" | "void";
      orderId?: string;
    };

    if (!body.orderId) {
      return NextResponse.json({ error: "Missing orderId." }, { status: 400 });
    }

    if (body.action === "void") {
      await voidQrcodeOrder(body.orderId);
      return NextResponse.json({ ok: true, action: "void" });
    }

    const result = await confirmQrcodeOrder(body.orderId, adminId);
    return NextResponse.json({ ok: true, action: "confirm", ...result });
  } catch (error) {
    return adminError(error);
  }
}

function adminError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "Forbidden") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Request failed." }, { status: 400 });
}
