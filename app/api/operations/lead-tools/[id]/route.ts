import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { leadToolSpecSchema } from "@/lib/lead-tools/schema";
import { LeadToolConflictError, loadLeadTool, updateLeadToolSpec } from "@/lib/lead-tools/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Lead tools unavailable." }, { status: 503 });
    const { id } = await params;
    const tool = await loadLeadTool(admin, userId, id);
    if (!tool) return NextResponse.json({ error: "Lead tool not found." }, { status: 404 });
    return NextResponse.json({ tool }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Lead tools unavailable." }, { status: 503 });
    const { id } = await params;

    const body = await request.json();
    const spec = leadToolSpecSchema.parse(body?.spec);
    const tool = await updateLeadToolSpec(admin, userId, id, {
      spec,
      note: typeof body?.note === "string" ? body.note.slice(0, 200) : undefined,
      expectedLatestVersionId:
        body?.expectedLatestVersionId === null || typeof body?.expectedLatestVersionId === "string"
          ? body.expectedLatestVersionId
          : undefined
    });
    return NextResponse.json({ tool });
  } catch (error) {
    if (error instanceof LeadToolConflictError) {
      return NextResponse.json({ error: "内容在别处被修改过，请刷新后重试。", code: "VERSION_CONFLICT" }, { status: 409 });
    }
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const unauth = error instanceof Error && error.message === "Unauthorized";
  const invalid = error instanceof Error && (error.name === "ZodError" || error.message.startsWith("结果「"));
  return NextResponse.json(
    {
      error: unauth
        ? "Please log in."
        : invalid
          ? (error as Error).message
          : "Lead tools are temporarily unavailable."
    },
    { status: unauth ? 401 : invalid ? 422 : 503 }
  );
}
