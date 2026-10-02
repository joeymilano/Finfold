import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@/lib/extension/crypto";

/**
 * WeApp (微信小程序) auth — mirrors the extension session pattern:
 * opaque bearer tokens whose SHA-256 hash is stored in `weapp_tokens`,
 * revocable and expiring. The only issuance path is POST /api/weapp/v1/session,
 * which is authenticated by the shared cloud-function bridge secret (the
 * bridge is the sole party that performs code2session and knows the openid).
 */

export const WEAPP_BRIDGE_SECRET_HEADER = "x-weapp-bridge-secret";

const WEAPP_TOKEN_PREFIX = "ff_wa_";
const WEAPP_TOKEN_TTL_DAYS = 30;

export type WeappSession = {
  identityId: string;
  userId: string;
};

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/** Verifies the shared secret presented by the cloud-function bridge. */
export async function verifyWeappBridgeRequest(request: Request): Promise<boolean> {
  const expected = process.env.WEAPP_BRIDGE_SECRET;
  const provided = request.headers.get(WEAPP_BRIDGE_SECRET_HEADER);
  if (!expected || !provided) return false;
  const [providedHash, expectedHash] = await Promise.all([
    sha256Hex(provided),
    sha256Hex(expected)
  ]);
  return constantTimeEqual(providedHash, expectedHash);
}

export function randomWeappToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${WEAPP_TOKEN_PREFIX}${hex}`;
}

export function readWeappBearer(request: Request): string | null {
  const match = (request.headers.get("authorization") ?? "").match(
    /^Bearer\s+(ff_wa_[a-f0-9]{64})$/i
  );
  return match?.[1] ?? null;
}

/** Mints a session token for an identity. The raw token is returned once. */
export async function issueWeappToken(
  admin: SupabaseClient,
  input: { identityId: string; userId: string }
): Promise<string> {
  const token = randomWeappToken();
  const expiresAt = new Date(Date.now() + WEAPP_TOKEN_TTL_DAYS * 86_400_000).toISOString();
  const { error } = await admin.from("weapp_tokens").insert({
    identity_id: input.identityId,
    user_id: input.userId,
    token_hash: await sha256Hex(token),
    expires_at: expiresAt
  });
  if (error) throw new Error(`weapp token insert failed: ${error.message}`);
  return token;
}

/** Resolves a weapp bearer token to its session, or null when invalid/expired. */
export async function authenticateWeappRequest(
  request: Request,
  admin: SupabaseClient
): Promise<WeappSession | null> {
  const token = readWeappBearer(request);
  if (!token) return null;
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("weapp_tokens")
    .select("id, identity_id, user_id, expires_at")
    .eq("token_hash", await sha256Hex(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (error || !data || data.expires_at <= now) return null;

  void admin
    .from("weapp_tokens")
    .update({ last_used_at: now })
    .eq("id", data.id);
  return { identityId: data.identity_id, userId: data.user_id };
}
