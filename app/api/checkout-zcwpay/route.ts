
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabase";
import { apiError } from "@/lib/i18n";
import { isZcwPayConfigured, resolveChannel, deviceFromUserAgent, type ZcwChannel } from "@/lib/payment/zcwpay";
import { createZcwOrder, mockZcwOrder, shouldMockZcwOrder, type ZcwOrderKind } from "@/lib/payment/zcw-orders";
import { isQrcodePlanId } from "@/lib/payment/qrcode-constants";

// POST /api/checkout-zcwpay — place an Alipay/WeChat order through the ZCW
// aggregate gateway (CN checkout). Body:
//   { kind: "credits", packageId, channel } | { kind: "plan", planId, channel }
// channel is "alipay" | "wxpay". Inside WeChat/Alipay in-app browsers the
// channel is forced to the container's own wallet (resolveChannel) because a
// rival wallet's QR can never be scanned there.
//
// The pending credit_purchases row is written BEFORE the gateway call, and
// the amount comes from the pack/plan tables — never from the client.

function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0];
  return (forwarded ?? "").trim() || "0.0.0.0";
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();

    const body = (await request.json().catch(() => ({}))) as {
      kind?: string;
      packageId?: string;
      planId?: string;
      channel?: string;
      name?: string;
    };

    const channel: ZcwChannel = body.channel === "wxpay" ? "wxpay" : "alipay";

    let kind: ZcwOrderKind | null = null;
    if (body.kind === "credits" && body.packageId) {
      kind = { kind: "credits", packId: body.packageId };
    } else if (body.kind === "plan" && isQrcodePlanId(body.planId)) {
      kind = { kind: "plan", planId: body.planId };
    }
    if (!kind) {
      return NextResponse.json(
        { error: apiError(request.headers, "无效的订单请求。", "Invalid checkout request.") },
        { status: 400 }
      );
    }

    if (!isZcwPayConfigured()) {
      if (shouldMockZcwOrder()) {
        return NextResponse.json({ order: mockZcwOrder(userId, kind, channel), mock: true });
      }
      return NextResponse.json(
        {
          error: apiError(
            request.headers,
            "扫码支付暂未开放，请稍后再试。",
            "Scan-to-pay is not available yet. Please try again later."
          )
        },
        { status: 503 }
      );
    }

    const device = deviceFromUserAgent(request.headers.get("user-agent"));
    const order = await createZcwOrder(userId, kind, resolveChannel(channel, device), {
      device,
      clientIp: clientIpFrom(request.headers),
      name: body.name?.slice(0, 120) || "Finfold 创作点数"
    });

    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: apiError(request.headers, "请先登录再发起支付。", "Please log in to pay.") },
        { status: 401 }
      );
    }
    console.error("[checkout-zcwpay] failed:", error);
    return NextResponse.json(
      {
        error: apiError(
          request.headers,
          "发起支付失败，请稍后重试。",
          "Unable to start the payment. Please try again."
        )
      },
      { status: 500 }
    );
  }
}
