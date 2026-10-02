import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { canDiscover, discoveryEnabled, enqueueSignalDiscovery, loadDiscoveryCredits, loadSignalDiscoveryStatus } from "@/lib/signals/service";
import { loadSignalDiscoveryPreferences } from "@/lib/signals/preferences";

export async function GET() {
  try {
    const userId = await getCurrentUserId(); const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Signal storage unavailable." }, { status: 503 });
    return NextResponse.json(await loadSignalDiscoveryStatus(admin, userId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error); }
}
export async function POST() {
  try {
    const userId = await getCurrentUserId(); const admin = createSupabaseAdminClient();
    if (!admin || !discoveryEnabled()) return NextResponse.json({ error: "Signal discovery is not enabled." }, { status: 503 });
    if (!(await loadSignalDiscoveryPreferences(admin, userId)).enabled) return NextResponse.json({ error: "Signal discovery is turned off.", code: "DISABLED_BY_USER" }, { status: 403 });
    if (!await canDiscover(admin, userId)) return NextResponse.json({ error: "Business discovery requires an Agent plan." }, { status: 403 });
    const credits = await loadDiscoveryCredits(admin, userId);
    if (credits.available >= 0 && credits.available < credits.minimumRunCost) return NextResponse.json({ error: "Insufficient credits.", code: "INSUFFICIENT_CREDITS",
      available: credits.available, needed: credits.minimumRunCost }, { status: 402 });
    const id = await enqueueSignalDiscovery(admin, userId);
    if (!id) return NextResponse.json({ error: "Add your business, audience or watch keywords first." }, { status: 422 });
    return NextResponse.json({ id, ...await loadSignalDiscoveryStatus(admin, userId) }, { status: 202 });
  } catch (error) { return routeError(error); }
}
function routeError(error: unknown) {
  const unauth = error instanceof Error && error.message === "Unauthorized";
  return NextResponse.json({ error: unauth ? "Please log in." : "Signal discovery is temporarily unavailable." }, { status: unauth ? 401 : 503 });
}
