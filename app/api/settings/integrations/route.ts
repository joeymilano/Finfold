
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/lib/secret-encryption";
import { persistenceUnavailableMessage } from "@/lib/runtime-mode";

/**
 * X (Twitter) has no free public read tier — POLLABLE_PLATFORMS (see
 * lib/performance-poll.ts) can only poll a user's tweets once that user
 * supplies their own bearer token (X Basic tier, $200/mo, billed to them
 * directly, not Finfold). This route lets a user add/remove that token.
 * The token is stored in user_integrations (migration 026), a table with
 * RLS enabled but NO policies — every read/write here goes through the
 * admin client, and GET below never echoes the full token back to the
 * browser, so it never becomes reachable via the anon-key session path.
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Integrations") }, { status: 503 });
    }

    const { data, error } = await admin
      .from("user_integrations")
      .select("x_bearer_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;

    const storedToken = data?.x_bearer_token as string | null | undefined;
    const token = storedToken ? await decryptSecret(storedToken) : null;
    return NextResponse.json({
      x: {
        connected: Boolean(token),
        tokenTail: token ? `…${token.slice(-4)}` : null,
        encrypted: storedToken ? isEncryptedSecret(storedToken) : false
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to view integrations." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load integrations." },
      { status: 400 }
    );
  }
}

const putRequestSchema = z.object({
  xBearerToken: z.string().min(10)
});

/**
 * Verifies the token actually works before storing it — GET
 * /2/tweets/20 ("just setting up my twttr") is a stable, always-public
 * tweet, so 200/404 both prove the token authenticates; 401/403 means the
 * token itself is bad and we should reject it with a clear error instead
 * of silently storing a dead credential.
 */
async function verifyXToken(token: string): Promise<boolean> {
  const response = await fetch("https://api.x.com/2/tweets/20", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.status !== 401 && response.status !== 403;
}

export async function PUT(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const { xBearerToken } = putRequestSchema.parse(await request.json());

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Integrations are not available in this environment." }, { status: 503 });
    }

    const isValid = await verifyXToken(xBearerToken);
    if (!isValid) {
      return NextResponse.json({ error: "This token could not be verified against the X API. Check that it's a valid bearer token." }, { status: 400 });
    }

    const encryptedToken = await encryptSecret(xBearerToken);
    const { error } = await admin.from("user_integrations").upsert(
      {
        user_id: userId,
        x_bearer_token: encryptedToken,
        x_token_added_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
    if (error) throw error;

    return NextResponse.json({ x: { connected: true, tokenTail: `…${xBearerToken.slice(-4)}`, encrypted: true } });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to connect an integration." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to connect this integration." },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Integrations are not available in this environment." }, { status: 503 });
    }

    const { error } = await admin
      .from("user_integrations")
      .update({ x_bearer_token: null, x_token_added_at: null, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw error;

    return NextResponse.json({ x: { connected: false, tokenTail: null } });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to disconnect an integration." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to disconnect this integration." },
      { status: 400 }
    );
  }
}
