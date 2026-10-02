import { NextResponse } from "next/server";
import { createAuthorizationCode, oauthAuthorizeSchema } from "@/lib/extension/oauth";
import { extensionAuthEnabled } from "@/lib/extension/usage";
import { getCurrentUserId } from "@/lib/supabase";

export async function POST(request: Request) {
  if (!extensionAuthEnabled()) return NextResponse.json({ error: "FEATURE_DISABLED" }, { status: 503 });
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const form = await request.formData();
  const parsed = oauthAuthorizeSchema.safeParse({
    redirectUri: form.get("redirectUri"),
    codeChallenge: form.get("codeChallenge"),
    state: form.get("state")
  });
  if (!parsed.success) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  const code = await createAuthorizationCode({ userId, ...parsed.data });
  const redirect = new URL(parsed.data.redirectUri);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("state", parsed.data.state);
  return NextResponse.redirect(redirect, 303);
}
