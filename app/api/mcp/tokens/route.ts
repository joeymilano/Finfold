
import { NextResponse } from "next/server";
import { createMcpSecret, hashMcpSecret, tokenPrefix } from "@/lib/mcp/auth";
import { mcpTokenCreateSchema } from "@/lib/mcp/types";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const supabase = createSupabaseAdminClient();
    if (!supabase) return NextResponse.json({ error: "MCP token storage is not configured." }, { status: 503 });
    const { data, error } = await supabase
      .from("mcp_api_tokens")
      .select("id, name, token_prefix, scopes, last_used_at, created_at, expires_at, revoked_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ tokens: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "Unauthorized" ? "Please log in to manage MCP access." : "Could not load MCP tokens." }, { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = mcpTokenCreateSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    if (!supabase) return NextResponse.json({ error: "MCP token storage is not configured." }, { status: 503 });
    const secret = createMcpSecret();
    const { data, error } = await supabase
      .from("mcp_api_tokens")
      .insert({ user_id: userId, name: input.name, token_hash: await hashMcpSecret(secret), token_prefix: tokenPrefix(secret), scopes: ["brand:read", "rules:read", "content:generate", "content:read"] })
      .select("id, name, token_prefix, scopes, created_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ token: data, secret });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "Unauthorized" ? "Please log in to create an MCP token." : error instanceof Error ? error.message : "Could not create MCP token." }, { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 });
  }
}
