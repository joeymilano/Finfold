export const runtime = "edge";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase";

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ ok: true });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) {
    return NextResponse.json({ ok: true }); // Unauthenticated: ignore silently
  }

  const body = (await request.json().catch(() => ({}))) as { locale?: string };
  const locale = body.locale === "en" || body.locale === "zh" ? body.locale : null;

  if (!locale) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (admin) {
    await admin
      .from("profiles")
      .update({ locale })
      .eq("id", user.id);
  }

  return NextResponse.json({ ok: true });
}
