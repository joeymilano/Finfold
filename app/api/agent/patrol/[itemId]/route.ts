
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { listPatrolItems, refreshUserPatrol } from "@/lib/agent/patrol";

const updatePatrolItemSchema = z.object({
  status: z.enum(["done", "dismissed"])
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { itemId } = await params;
    const input = updatePatrolItemSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Agent patrol requires Supabase." }, { status: 503 });
    }
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("agent_patrol_items")
      .update({
        status: input.status,
        completed_at: now,
        updated_at: now
      })
      .eq("id", itemId)
      .eq("user_id", userId)
      .eq("status", "open")
      .select("id, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Open duty item not found." }, { status: 404 });
    }
    const openItem = await refreshUserPatrol(admin, userId);
    const items = await listPatrolItems(admin, userId, 8);
    return NextResponse.json({ item: data, openItem, items });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to update the Agent duty queue." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update the duty item." },
      { status: 400 }
    );
  }
}
