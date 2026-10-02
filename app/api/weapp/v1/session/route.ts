import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { sha256Hex } from "@/lib/extension/crypto";
import { issueWeappToken, verifyWeappBridgeRequest } from "@/lib/weapp/auth";

/**
 * The only token-issuance endpoint. Called exclusively by the WeChat cloud
 * function bridge, which has already performed code2session — the bridge
 * secret proves the caller, so the openid in the body is trusted from there.
 */
const bodySchema = z.object({
  openid: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  unionid: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).nullish(),
  nickname: z.string().trim().max(32).nullish()
});

export async function POST(request: Request) {
  if (!(await verifyWeappBridgeRequest(request))) {
    return NextResponse.json({ error: "bridge unauthorized" }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "storage unavailable" }, { status: 503 });
  }
  try {
    const { openid, unionid, nickname } = bodySchema.parse(await request.json());

    const { data: existing } = await admin
      .from("weapp_identities")
      .select("id, user_id, nickname, unionid")
      .eq("openid", openid)
      .maybeSingle();

    let identityId: string;
    let userId: string;
    let isNew = false;

    if (existing) {
      identityId = existing.id;
      userId = existing.user_id;
      await admin
        .from("weapp_identities")
        .update({
          last_seen_at: new Date().toISOString(),
          unionid: existing.unionid ?? unionid ?? null,
          nickname: existing.nickname ?? nickname ?? null
        })
        .eq("id", identityId);
    } else {
      isNew = true;
      const email = `wa_${(await sha256Hex(openid)).slice(0, 24)}@weapp.finfold.app`;
      const password = (await sha256Hex(`${openid}:${crypto.randomUUID()}`)).slice(0, 48);
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: nickname ?? "微信用户", weapp_openid: openid }
      });
      if (createError || !created?.user) {
        // A same-email user already existing means the identity row was lost
        // (manual delete); refuse rather than silently re-linking.
        return NextResponse.json(
          { error: createError?.message ?? "user creation failed" },
          { status: 409 }
        );
      }
      userId = created.user.id;
      const { data: inserted, error: identityError } = await admin
        .from("weapp_identities")
        .insert({ openid, unionid: unionid ?? null, user_id: userId, nickname: nickname ?? null })
        .select("id")
        .single();
      if (identityError || !inserted) {
        throw new Error(identityError?.message ?? "identity insert failed");
      }
      identityId = inserted.id;
      // Idempotent welcome grant — a replayed login never double-grants.
      await admin.rpc("grant_weapp_signup_credits", { p_user_id: userId, p_amount: 200 });
    }

    const token = await issueWeappToken(admin, { identityId, userId });
    return NextResponse.json({ token, userId, isNew });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "session failed" },
      { status: 400 }
    );
  }
}
