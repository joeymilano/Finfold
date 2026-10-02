import { createSupabaseAdminClient } from "@/lib/supabase";

export type McpTokenRecord = {
  id: string;
  user_id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
};

const TOKEN_PREFIX = "ff_mcp_";
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function createMcpSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${TOKEN_PREFIX}${value}`;
}

export function tokenPrefix(secret: string): string {
  return secret.slice(0, TOKEN_PREFIX.length + 8);
}

export async function hashMcpSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(ff_mcp_[a-f0-9]{64})$/i);
  return match?.[1] ?? null;
}

export function readMcpIdempotencyKey(value: string | null): string | null {
  const candidate = value?.trim();
  return candidate && IDEMPOTENCY_KEY_PATTERN.test(candidate) ? candidate : null;
}

export async function authenticateMcpRequest(request: Request): Promise<McpTokenRecord | null> {
  const secret = readBearerToken(request);
  const supabase = createSupabaseAdminClient();
  if (!secret || !supabase) return null;

  const { data, error } = await supabase
    .from("mcp_api_tokens")
    .select("id, user_id, name, token_prefix, scopes, expires_at, revoked_at")
    .eq("token_hash", await hashMcpSecret(secret))
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;

  // Best effort only: a successful request must never fail because telemetry
  // could not be persisted.
  void supabase
    .from("mcp_api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .eq("user_id", data.user_id);
  return data as McpTokenRecord;
}
