import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/i18n";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { saveSignalDiscoveryPreferences } from "@/lib/signals/preferences";

const preferenceInputSchema = z.object({ enabled: z.boolean() }).strict();

export async function PUT(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: apiError(request.headers, "信号发现设置存储尚未配置。", "Signal discovery preferences are not configured.") }, { status: 503 });
    }
    const input = preferenceInputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json({ error: apiError(request.headers, "开关状态不合法。", "Invalid toggle state.") }, { status: 400 });
    }
    const saved = await saveSignalDiscoveryPreferences(admin, userId, input.data.enabled);
    return NextResponse.json({ ok: true, enabled: saved.enabled });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "登录后才能保存信号发现设置。", "Sign in to save your signal discovery preferences.") }, { status: 401 });
    }
    console.error("[signal-discovery] preference update failed", error);
    return NextResponse.json({ error: apiError(request.headers, "信号发现设置保存失败，请重试。", "Could not save your signal discovery preferences. Please try again.") }, { status: 500 });
  }
}
