
import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function DELETE(_: Request, { params }: { params: Promise<{ tokenId: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { tokenId } = await params;
    const supabase = createSupabaseAdminClient();
    if (!supabase) return NextResponse.json({ error: "MCP token storage is not configured." }, { status: 503 });
    const { data, error } = await supabase
      .from("mcp_api_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", tokenId)
      .eq("user_id", userId)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "MCP token not found." }, { status: 404 });
    }
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "Unauthorized" ? "Please log in to revoke an MCP token." : "Could not revoke MCP token." }, { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 });
  }
}
