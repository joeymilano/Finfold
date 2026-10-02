import { NextResponse } from "next/server";
import { z } from "zod";
import { persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { readTextWithLimit } from "@/lib/safe-url";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  decryptWechatComponentEcho,
  decryptWechatComponentEvent,
  getWechatComponentConfig
} from "@/lib/wechat-component";
import { storeWechatComponentVerifyTicket } from "@/lib/wechat-connections";

const eventQuerySchema = z.object({
  timestamp: z.string().regex(/^\d{1,16}$/),
  nonce: z.string().min(1).max(256),
  msg_signature: z.string().regex(/^[0-9a-f]{40}$/i)
});

const echoQuerySchema = eventQuerySchema.extend({
  echostr: z.string().min(1).max(16_384)
});

/** Completes WeChat's encrypted URL-validity challenge for the component callback. */
export async function GET(request: Request) {
  try {
    const config = getWechatComponentConfig();
    if (!config) return new NextResponse("Not found", { status: 404 });
    const query = echoQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const echo = await decryptWechatComponentEcho({
      config,
      timestamp: query.timestamp,
      nonce: query.nonce,
      signature: query.msg_signature,
      echo: query.echostr
    });
    return new NextResponse(echo, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  } catch {
    return new NextResponse("Invalid signature", { status: 401 });
  }
}

/** Receives encrypted WeChat Open Platform component tickets and authorization events. */
export async function POST(request: Request) {
  try {
    const config = getWechatComponentConfig();
    if (!config) return new NextResponse("Not found", { status: 404 });
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
      return new NextResponse("Payload too large", { status: 413 });
    }
    const query = eventQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const xml = await readTextWithLimit(new Response(request.body, { headers: request.headers }), 64 * 1024);
    if (!xml) return new NextResponse("Invalid payload", { status: 400 });

    const event = await decryptWechatComponentEvent({
      config,
      timestamp: query.timestamp,
      nonce: query.nonce,
      signature: query.msg_signature,
      xml
    });
    if (event.infoType === "component_verify_ticket") {
      const admin = createSupabaseAdminClient();
      if (!admin) {
        return NextResponse.json(
          { error: persistenceUnavailableMessage("WeChat component events") },
          { status: 503 }
        );
      }
      await storeWechatComponentVerifyTicket(admin, config, event);
    }
    return new NextResponse("success", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  } catch (error) {
    if (error instanceof Error && /too large/i.test(error.message)) {
      return new NextResponse("Payload too large", { status: 413 });
    }
    // Never reflect decrypted WeChat event details or signature material.
    return new NextResponse("Invalid signature", { status: 401 });
  }
}
