import { NextResponse } from "next/server";
import { getIncomingReferral } from "@/lib/referrals";
import { getCurrentUserId } from "@/lib/supabase";


export async function GET() {
  try {
    const userId = await getCurrentUserId();
    return NextResponse.json({ referral: await getIncomingReferral(userId) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ referral: null }, { status: 401 });
    }
    return NextResponse.json({ referral: null }, { status: 500 });
  }
}
