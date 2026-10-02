import { sha256Hex } from "@/lib/extension/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase";

export type ExtensionSession = {
  id: string;
  userId: string;
  scope: string[];
};

export function readExtensionBearer(request: Request): string | null {
  const match = (request.headers.get("authorization") ?? "").match(
    /^Bearer\s+(ff_ext_a_[a-f0-9]{64})$/i
  );
  return match?.[1] ?? null;
}

export async function authenticateExtensionRequest(request: Request): Promise<ExtensionSession | null> {
  const token = readExtensionBearer(request);
  const supabase = createSupabaseAdminClient();
  if (!token || !supabase) return null;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("extension_sessions")
    .select("id, user_id, scope, access_expires_at")
    .eq("access_token_hash", await sha256Hex(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data || data.access_expires_at <= now) return null;

  void supabase
    .from("extension_sessions")
    .update({ last_used_at: now, updated_at: now })
    .eq("id", data.id);
  return { id: data.id, userId: data.user_id, scope: String(data.scope).split(/\s+/).filter(Boolean) };
}
