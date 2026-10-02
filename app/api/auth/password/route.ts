
import { NextResponse } from "next/server";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { analyzePassword } from "@/lib/password-policy";

/**
 * POST /api/auth/password
 *
 * Update the current user's password.
 * The server client validates the session cookie before performing
 * the update, so the secret key is never exposed to the browser.
 *
 * Expected body: { password: string }
 */
export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, { scope: "auth:password", limit: 5, windowMs: 60 * 60 * 1000 });
  if (rateLimited) return rateLimited;

  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Auth system not configured." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
  };

  const password = body.password;

  if (!password) {
    return NextResponse.json(
      { error: "New password is required." },
      { status: 400 }
    );
  }

  // 密码强度硬校验（与前端 / 注册共享同一策略，防绕过）
  const pwdResult = analyzePassword(password);
  if (!pwdResult.valid) {
    return NextResponse.json(
      { error: pwdResult.messageEn || "Password does not meet requirements." },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Auth system not available." },
      { status: 503 }
    );
  }

  // Verify the user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You must be logged in to update your password." },
      { status: 401 }
    );
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to update password." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
