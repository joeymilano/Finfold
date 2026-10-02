import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { GrowthLoopDisabledError, assertGrowthLoopEnabled } from "@/lib/growth-loop/contracts";

export type GrowthLoopRequestContext = {
  userId: string;
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
};

export type RouteErrorResponse = NextResponse<Record<string, unknown>>;

/**
 * Shared guard for every growth-loop route: feature gate → session → admin
 * client. Ownership itself is enforced by user_id filters in each query, per
 * ADR-001.
 */
export async function guardGrowthLoopRequest(): Promise<
  { ok: true; context: GrowthLoopRequestContext } | { ok: false; response: RouteErrorResponse }
> {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Please log in to use the growth loop." }, { status: 401 }) };
  }
  try {
    assertGrowthLoopEnabled(userId);
  } catch (error) {
    if (error instanceof GrowthLoopDisabledError) {
      return { ok: false, response: NextResponse.json({ error: "Growth loop is not enabled for this account." }, { status: 403 }) };
    }
    throw error;
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false, response: NextResponse.json({ error: "Growth loop requires durable storage." }, { status: 503 }) };
  }
  return { ok: true, context: { userId, admin } };
}

export function growthLoopErrorResponse(error: unknown): RouteErrorResponse {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (error instanceof Error) {
    // Postgres RPC failures surface here; keep the message so the client can
    // show honest reasons (stale approvals, paused goals, …).
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Unexpected growth loop failure." }, { status: 500 });
}

export function appUrlFromRequest(request: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
}
