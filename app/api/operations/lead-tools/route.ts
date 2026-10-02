import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { blankLeadToolSpec, leadToolSpecSchema } from "@/lib/lead-tools/schema";
import { createLeadTool, listLeadTools } from "@/lib/lead-tools/service";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Lead tools unavailable." }, { status: 503 });
    return NextResponse.json({ tools: await listLeadTools(admin, userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return routeError(error);
  }
}

/** Creates a blank draft scaffold the owner edits by hand (no AI charge). */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Lead tools unavailable." }, { status: 503 });

    const body = await request.json().catch(() => ({}));
    const spec = body?.spec ? leadToolSpecSchema.parse(body.spec) : blankLeadToolSpec();
    const tool = await createLeadTool(admin, userId, {
      title: spec.title,
      businessContext: String(body?.businessContext ?? "").slice(0, 2000),
      spec
    });
    return NextResponse.json({ tool }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const unauth = error instanceof Error && error.message === "Unauthorized";
  return NextResponse.json(
    { error: unauth ? "Please log in." : "Lead tools are temporarily unavailable." },
    { status: unauth ? 401 : 503 }
  );
}
