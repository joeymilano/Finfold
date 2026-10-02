import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/i18n";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { saveTrendSourcePreferences } from "@/lib/trends/source-preferences";
import { trendSourcePreferenceKeySchema } from "@/lib/trends/types";

const preferenceInputSchema = z.object({
  enabledSourceKeys: z.array(trendSourcePreferenceKeySchema).min(1).max(20)
}).strict();

export async function PUT(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: apiError(request.headers, "数据源偏好存储尚未配置。", "Trend source preferences are not configured.") }, { status: 503 });
    }
    const input = preferenceInputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json({ error: apiError(request.headers, "请至少保留一个数据源。", "Keep at least one trend source enabled.") }, { status: 400 });
    }
    const enabled = await saveTrendSourcePreferences(admin, userId, input.data.enabledSourceKeys);
    return NextResponse.json({ ok: true, enabledSourceKeys: [...enabled] });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "登录后才能保存数据源偏好。", "Sign in to save your trend source preferences.") }, { status: 401 });
    }
    console.error("[opportunity-radar] source preference update failed", error);
    return NextResponse.json({ error: apiError(request.headers, "数据源偏好保存失败，请重试。", "Could not save trend source preferences. Please try again.") }, { status: 500 });
  }
}
