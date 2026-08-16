
import { NextResponse } from "next/server";
import { isCreemFoundingMemberCheckoutConfigured } from "@/lib/payment/creem";
import { FOUNDING_MEMBER_SEAT_LIMIT } from "@/lib/payment/constants";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";

/**
 * Public seat-count check for the founding-member presale banner (billing
 * page) — no auth required, since a visitor needs to see this before
 * deciding to sign up. Returns 0 taken / full limit remaining when
 * Supabase isn't configured rather than erroring, so local dev still
 * renders the banner.
 */
export async function GET() {
  const enabled = isCreemFoundingMemberCheckoutConfigured();
  if (!enabled) {
    return NextResponse.json({ enabled: false, seatsTaken: 0, seatLimit: FOUNDING_MEMBER_SEAT_LIMIT, seatsRemaining: 0 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    if (!isLocalMockMode()) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Founding member availability") }, { status: 503 });
    }
    return NextResponse.json({
      enabled,
      seatsTaken: 0,
      seatLimit: FOUNDING_MEMBER_SEAT_LIMIT,
      seatsRemaining: enabled ? FOUNDING_MEMBER_SEAT_LIMIT : 0
    });
  }

  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("founding_member", true);

  if (error) {
    console.error("[founding-members] count failed:", JSON.stringify(error));
    return NextResponse.json({ error: "Founding member availability is temporarily unavailable." }, { status: 503 });
  }

  const seatsTaken = count ?? 0;
  return NextResponse.json({
    enabled,
    seatsTaken,
    seatLimit: FOUNDING_MEMBER_SEAT_LIMIT,
    seatsRemaining: enabled ? Math.max(0, FOUNDING_MEMBER_SEAT_LIMIT - seatsTaken) : 0
  });
}
