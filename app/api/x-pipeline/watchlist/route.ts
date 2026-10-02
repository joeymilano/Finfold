import { NextResponse } from "next/server";
import { z } from "zod";
import {
  guardXPipelineRequest,
  listXWatchlist,
  setXWatchlistEntryActive,
  upsertXWatchlistEntry,
  xPipelineErrorResponse,
  xWatchlistInputSchema
} from "@/lib/x-pipeline/settings";

const toggleSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean()
});

export async function GET() {
  const guard = await guardXPipelineRequest();
  if (!guard.ok) return guard.response;
  try {
    const entries = await listXWatchlist(guard.context.admin, guard.context.userId);
    return NextResponse.json({ entries });
  } catch (error) {
    return xPipelineErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const guard = await guardXPipelineRequest();
  if (!guard.ok) return guard.response;
  try {
    const input = xWatchlistInputSchema.parse(await request.json());
    await upsertXWatchlistEntry(guard.context.admin, guard.context.userId, input);
    const entries = await listXWatchlist(guard.context.admin, guard.context.userId);
    return NextResponse.json({ entries }, { status: 201 });
  } catch (error) {
    return xPipelineErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const guard = await guardXPipelineRequest();
  if (!guard.ok) return guard.response;
  try {
    const input = toggleSchema.parse(await request.json());
    const updated = await setXWatchlistEntryActive(
      guard.context.admin,
      guard.context.userId,
      input.id,
      input.active
    );
    if (!updated) return NextResponse.json({ error: "Unknown watchlist entry." }, { status: 404 });
    const entries = await listXWatchlist(guard.context.admin, guard.context.userId);
    return NextResponse.json({ entries });
  } catch (error) {
    return xPipelineErrorResponse(error);
  }
}
