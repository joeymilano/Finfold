import { z } from "zod";
import { isAllowedExtensionOrigin } from "./cors";
import { randomOpaqueToken, sha256Hex } from "@/lib/extension/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase";

const REDIRECT_PATTERN = /^https:\/\/([a-p]{32})\.chromiumapp\.org\/finfold$/;
const STATE_PATTERN = /^[A-Za-z0-9._~-]{32,180}$/;
const PKCE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export const oauthAuthorizeSchema = z.object({
  redirectUri: z.string().max(300).refine(isAllowedOauthRedirect),
  codeChallenge: z.string().regex(PKCE_PATTERN),
  state: z.string().regex(STATE_PATTERN)
}).strict();

export const oauthTokenSchema = z.discriminatedUnion("grantType", [
  z.object({
    grantType: z.literal("authorization_code"),
    code: z.string().regex(/^ff_ext_c_[a-f0-9]{64}$/),
    codeVerifier: z.string().regex(PKCE_PATTERN),
    redirectUri: z.string().max(300).refine(isAllowedOauthRedirect)
  }).strict(),
  z.object({
    grantType: z.literal("refresh_token"),
    refreshToken: z.string().regex(/^ff_ext_r_[a-f0-9]{64}$/)
  }).strict()
]);

export function isAllowedOauthRedirect(value: string): boolean {
  const match = value.match(REDIRECT_PATTERN);
  return Boolean(match && isAllowedExtensionOrigin(`chrome-extension://${match[1]}`));
}

export async function createAuthorizationCode(input: {
  userId: string;
  redirectUri: string;
  codeChallenge: string;
}): Promise<string> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Extension OAuth is not configured.");
  const code = randomOpaqueToken("ff_ext_c_");
  const { error } = await supabase.from("extension_oauth_codes").insert({
    code_hash: await sha256Hex(code),
    user_id: input.userId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    expires_at: new Date(Date.now() + 5 * 60 * 1_000).toISOString()
  });
  if (error) throw new Error("Could not create extension authorization code.");
  return code;
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const now = new Date().toISOString();
  const codeHash = await sha256Hex(input.code);
  const { data: row } = await supabase
    .from("extension_oauth_codes")
    .select("id, user_id, redirect_uri, code_challenge, expires_at")
    .eq("code_hash", codeHash)
    .is("consumed_at", null)
    .maybeSingle();
  if (!row || row.redirect_uri !== input.redirectUri || row.expires_at <= now) return null;
  if ((await pkceChallenge(input.codeVerifier)) !== row.code_challenge) return null;

  const { data: consumed, error: consumeError } = await supabase
    .from("extension_oauth_codes")
    .update({ consumed_at: now })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (consumeError || !consumed) return null;
  return issueSession(row.user_id);
}

export async function refreshExtensionSession(refreshToken: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const now = new Date().toISOString();
  const refreshHash = await sha256Hex(refreshToken);
  const { data: session } = await supabase
    .from("extension_sessions")
    .select("id, user_id, scope, refresh_expires_at")
    .eq("refresh_token_hash", refreshHash)
    .is("revoked_at", null)
    .maybeSingle();
  if (!session || session.refresh_expires_at <= now) return null;

  const accessToken = randomOpaqueToken("ff_ext_a_");
  const nextRefreshToken = randomOpaqueToken("ff_ext_r_");
  const accessExpiresAt = new Date(Date.now() + 15 * 60 * 1_000);
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
  const { data: updated, error } = await supabase
    .from("extension_sessions")
    .update({
      access_token_hash: await sha256Hex(accessToken),
      access_expires_at: accessExpiresAt.toISOString(),
      refresh_token_hash: await sha256Hex(nextRefreshToken),
      refresh_expires_at: refreshExpiresAt.toISOString(),
      last_used_at: now,
      updated_at: now
    })
    .eq("id", session.id)
    .eq("refresh_token_hash", refreshHash)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error || !updated) return null;

  return tokenResponse(accessToken, nextRefreshToken, accessExpiresAt, refreshExpiresAt, session.scope);
}

export async function revokeExtensionSession(token: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;
  const hash = await sha256Hex(token);
  const column = token.startsWith("ff_ext_r_") ? "refresh_token_hash" : "access_token_hash";
  const { data, error } = await supabase
    .from("extension_sessions")
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq(column, hash)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}

async function issueSession(userId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Extension OAuth is not configured.");
  const accessToken = randomOpaqueToken("ff_ext_a_");
  const refreshToken = randomOpaqueToken("ff_ext_r_");
  const accessExpiresAt = new Date(Date.now() + 15 * 60 * 1_000);
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
  const scope = "extension:generate extension:save";
  const { error } = await supabase.from("extension_sessions").insert({
    user_id: userId,
    access_token_hash: await sha256Hex(accessToken),
    access_expires_at: accessExpiresAt.toISOString(),
    refresh_token_hash: await sha256Hex(refreshToken),
    refresh_expires_at: refreshExpiresAt.toISOString(),
    scope
  });
  if (error) throw new Error("Could not create extension session.");
  return tokenResponse(accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, scope);
}

function tokenResponse(
  accessToken: string,
  refreshToken: string,
  accessExpiresAt: Date,
  refreshExpiresAt: Date,
  scope: string
) {
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer" as const,
    expiresIn: Math.floor((accessExpiresAt.getTime() - Date.now()) / 1_000),
    accessExpiresAt: accessExpiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    scope
  };
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  let binary = "";
  new Uint8Array(digest).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
