import { NextResponse } from "next/server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { appendTrackingParams } from "@/lib/mission-attribution";
import { captureServerEvent } from "@/lib/posthog-server";
import { createSupabaseAdminClient } from "@/lib/supabase";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const rateLimited = enforceApiRateLimit(request, { scope: "mission-tracking", limit: 180, windowMs: 60 * 60 * 1_000 });
  if (rateLimited) return rateLimited;
  const { code } = await params;
  if (!/^[a-f0-9]{20}$/i.test(code)) return NextResponse.redirect(new URL("/", request.url));
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.redirect(new URL("/", request.url));

  const { data: link } = await admin
    .from("tracking_links")
    .select("id, mission_id, user_id, destination_url, source, medium, campaign, content, status")
    .eq("code", code)
    .maybeSingle();
  if (!link || link.status !== "active") return NextResponse.redirect(new URL("/", request.url));

  const destination = appendTrackingParams(String(link.destination_url), {
    source: String(link.source),
    medium: String(link.medium),
    campaign: String(link.campaign),
    content: link.content ? String(link.content) : null
  });
  if (new URL(request.url).searchParams.get("preview") === "1") {
    return NextResponse.redirect(destination);
  }

  const visitorId = crypto.randomUUID();
  const { data: recorded, error: trackingError } = await admin.rpc("record_mission_tracking_click", {
    p_tracking_link_id: link.id,
    p_visitor_id: visitorId
  });
  if (trackingError) {
    console.error("[mission-tracking] click ledger failed:", trackingError);
  } else if (recorded) {
    await captureServerEvent(String(link.user_id), "mission_tracking_click", {
      mission_id: link.mission_id,
      source: link.source,
      campaign: link.campaign
    });
  }

  const response = NextResponse.redirect(destination);
  response.cookies.set("finfold_visitor_id", visitorId, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 90 * 24 * 60 * 60
  });
  return response;
}
