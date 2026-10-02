
import { NextResponse } from "next/server";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import {
  currentPeriodKey,
  getCreditSpendSummary,
  periodKeyExpiry,
  periodKeyStart,
} from "@/lib/payment";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";

function unavailable(message = "Credits activity is temporarily unavailable.") {
  return NextResponse.json({ error: message }, { status: 503 });
}

// Returns one-cycle ledger semantics for the billing explanation panel:
// gross reservations/attempts, Credits restored by refunds, and net charged.
// Raw negative actions remain available for the existing client-side category
// rollup (内容生成 / 联网研究 / 视觉生成 / …).
export async function GET() {
  if (!hasSupabaseConfig()) {
    return unavailable();
  }

  let user: { id: string } | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return unavailable("Authentication is temporarily unavailable.");
    const authResult = await supabase.auth.getUser();
    if (authResult.error && !isAuthSessionMissingError(authResult.error)) {
      return unavailable("Authentication is temporarily unavailable.");
    }
    user = authResult.data.user;
  } catch {
    return unavailable("Authentication is temporarily unavailable.");
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Scope to the current monthly cycle so the breakdown explains "this month's
  // spend", matching the balance-card window (currentPeriodKey + plan batch).
  const snapshotAt = new Date();
  const periodKey = currentPeriodKey(snapshotAt);
  const cycleStart = periodKeyStart(periodKey);
  const cycleEnd = periodKeyExpiry(periodKey);
  const summary = await getCreditSpendSummary(user.id, cycleStart, cycleEnd);
  if (!summary) {
    return unavailable();
  }

  return NextResponse.json({ ...summary, cycleStart, cycleEnd });
}
