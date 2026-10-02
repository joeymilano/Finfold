
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  label: z.string().max(80).optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    const input = patchSchema.parse(await request.json());

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Not available in this environment." }, { status: 503 });
    }

    const { data, error } = await admin
      .from("watch_sources")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id, type, url, label, enabled")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Watch source not found." }, { status: 404 });
    }

    return NextResponse.json({ source: data });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update watch source." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Not available in this environment." }, { status: 503 });
    }

    const { error } = await admin.from("watch_sources").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete watch source." }, { status: 400 });
  }
}
