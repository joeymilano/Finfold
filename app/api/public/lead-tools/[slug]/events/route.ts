import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { captureServerEvent } from "@/lib/posthog-server";
import { recordLeadToolPublicEvent } from "@/lib/lead-tools/service";

const eventSchema = z.object({
  event: z.enum(["complete", "cta_click"]),
  resultId: z.string().max(64).optional(),
  entryId: z.string().max(64).optional()
});

/**
 * Anonymous visitor events for /t/[slug]. The 'open' counter is bumped
 * server-side during page render (never through this endpoint, which
 * would let scripts inflate opens); only completion and entry clicks
 * come through here. Everything lands in the aggregate-only daily RPC —
 * no individual visitor answer is ever stored.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const limited = enforceApiRateLimit(request, { scope: "lead-tool-events", limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const { slug } = await params;
    const body = eventSchema.parse(await request.json().catch(() => ({})));

    await recordLeadToolPublicEvent(slug, body.event, body.resultId, body.entryId);

    // Aggregate-only analytics identity (per tool, never per visitor) —
    // decision-grade volume signals without any person-level data.
    await captureServerEvent(`leadtool:${slug}`, `leadtool_public_${body.event}`, {
      slug,
      ...(body.resultId ? { result_id: body.resultId } : {}),
      ...(body.entryId ? { entry_id: body.entryId } : {})
    }).catch(() => undefined);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid event." }, { status: 422 });
  }
}
