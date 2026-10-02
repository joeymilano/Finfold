import { NextResponse } from "next/server";
import { z } from "zod";
import {
  decryptWechatAuthorizedAccountEcho,
  getWechatComponentConfig,
  verifyWechatAuthorizedAccountEvent
} from "@/lib/wechat-component";

const authorizedAppIdSchema = z.string().regex(/^wx[A-Za-z0-9]{16}$/);
const eventQuerySchema = z.object({
  timestamp: z.string().regex(/^\d{1,16}$/),
  nonce: z.string().min(1).max(256),
  msg_signature: z.string().regex(/^[0-9a-f]{40}$/i)
});

const echoQuerySchema = eventQuerySchema.extend({
  echostr: z.string().min(1).max(16_384)
});

/** Completes WeChat's encrypted URL-validity challenge for an authorized account. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ authorizedAppId: string }> }
) {
  try {
    const config = getWechatComponentConfig();
    if (!config) return new NextResponse("Not found", { status: 404 });
    const authorizedAppId = authorizedAppIdSchema.parse((await params).authorizedAppId);
    const query = echoQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const echo = await decryptWechatAuthorizedAccountEcho({
      config,
      authorizedAppId,
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

/** Receives encrypted events for an Official Account authorized to this platform. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ authorizedAppId: string }> }
) {
  try {
    const config = getWechatComponentConfig();
    if (!config) return new NextResponse("Not found", { status: 404 });
    const authorizedAppId = authorizedAppIdSchema.parse((await params).authorizedAppId);
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
      return new NextResponse("Payload too large", { status: 413 });
    }
    const query = eventQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const xml = await request.text();
    if (!xml || xml.length > 64 * 1024) return new NextResponse("Invalid payload", { status: 400 });

    await verifyWechatAuthorizedAccountEvent({
      config,
      authorizedAppId,
      timestamp: query.timestamp,
      nonce: query.nonce,
      signature: query.msg_signature,
      xml
    });
    return new NextResponse("success", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  } catch {
    // Never reflect decrypted WeChat event details or signature material.
    return new NextResponse("Invalid signature", { status: 401 });
  }
}
