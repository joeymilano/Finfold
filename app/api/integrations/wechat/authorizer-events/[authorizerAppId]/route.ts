import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { readTextWithLimit } from "@/lib/safe-url";
import { decryptWechatAuthorizedAccountEvent, getWechatComponentConfig } from "@/lib/wechat-component";
import { applyWechatPublicationCallback } from "@/lib/wechat-publication-jobs";

const paramsSchema = z.object({ authorizerAppId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) });
const eventQuerySchema = z.object({
  timestamp: z.string().regex(/^\d{1,16}$/),
  nonce: z.string().min(1).max(256),
  msg_signature: z.string().regex(/^[0-9a-f]{40}$/i)
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ authorizerAppId: string }> }
) {
  try {
    const config = getWechatComponentConfig();
    if (!config) return new NextResponse("Not found", { status: 404 });
    const { authorizerAppId } = paramsSchema.parse(await params);
    const query = eventQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const timestampMs = Number(query.timestamp) * 1_000;
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 10 * 60 * 1_000) {
      return new NextResponse("Expired event", { status: 401 });
    }
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
      return new NextResponse("Payload too large", { status: 413 });
    }
    const xml = await readTextWithLimit(new Response(request.body, { headers: request.headers }), 64 * 1024);
    if (!xml) {
      return new NextResponse("Invalid payload", { status: 400 });
    }
    const event = await decryptWechatAuthorizedAccountEvent({
      config,
      authorizedAppId: authorizerAppId,
      timestamp: query.timestamp,
      nonce: query.nonce,
      signature: query.msg_signature,
      xml
    });
    if (event.authorizerAppId !== authorizerAppId) {
      return new NextResponse("Invalid target", { status: 401 });
    }
    const admin = createSupabaseAdminClient();
    if (!admin) return new NextResponse("Unavailable", { status: 503 });
    await applyWechatPublicationCallback(admin, event);
    return new NextResponse("success", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  } catch (error) {
    if (error instanceof Error && /too large/i.test(error.message)) {
      return new NextResponse("Payload too large", { status: 413 });
    }
    return new NextResponse("Invalid signature", { status: 401 });
  }
}
