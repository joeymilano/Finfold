
import { NextResponse } from "next/server";
import { parseZcwNotify } from "@/lib/payment/zcwpay";
import { handleZcwNotify } from "@/lib/payment/zcw-orders";

// GET /api/webhooks/zcwpay — ZCW aggregate-gateway async payment notify.
//
// The gateway calls notify_url as a GET with RSA-signed query params and
// expects the literal body "success" once we've durably fulfilled the order;
// anything else makes it retry. We fail closed on: bad signature, unknown
// order, amount mismatch — and on a fulfillment error so the retry loop gets
// another chance.

export async function GET(request: Request) {
  const params = parseZcwNotify(new URL(request.url).searchParams);
  if (!params) {
    return new NextResponse("fail", { status: 200 });
  }

  const result = await handleZcwNotify(params);
  if (result.ok) {
    return new NextResponse("success", { status: 200 });
  }
  console.error(`[webhooks/zcwpay] rejected notify (${result.reason}):`, params.outTradeNo);
  return new NextResponse("fail", { status: 200 });
}
