import { NextResponse } from "next/server";
import { z } from "zod";
import { visualStoryThemeSchema } from "@/lib/visual-story";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

// ---------------------------------------------------------------------------
// Feature gate (mirrors the growth-loop / extension-reply pilot pattern:
// kill switch + mode + per-user whitelist; unknown values fail closed).
// ---------------------------------------------------------------------------

export type ContentPipelinePilotMode = "off" | "whitelist" | "open";

/** Global kill switch for every daily-pipeline surface. */
export function contentPipelineKillSwitchOn(): boolean {
  return process.env.CONTENT_PIPELINE_ENABLED === "true";
}

export function contentPipelinePilotMode(): ContentPipelinePilotMode {
  const raw = process.env.CONTENT_PIPELINE_PILOT_MODE;
  if (raw === "off" || raw === "whitelist" || raw === "open") return raw;
  return "whitelist";
}

export function contentPipelinePilotUserIds(): string[] {
  return (process.env.CONTENT_PIPELINE_PILOT_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function contentPipelineEnabled(userId: string): boolean {
  if (!contentPipelineKillSwitchOn()) return false;
  const mode = contentPipelinePilotMode();
  if (mode === "open") return true;
  if (mode === "off") return false;
  return contentPipelinePilotUserIds().includes(userId);
}

/** Coarse server-side visibility for the navigation entry. */
export function contentPipelineVisibleForNav(): boolean {
  if (!contentPipelineKillSwitchOn()) return false;
  const mode = contentPipelinePilotMode();
  return mode === "open" || contentPipelinePilotUserIds().length > 0;
}

export class ContentPipelineDisabledError extends Error {
  constructor() {
    super("The daily pipeline is not enabled for this account.");
    this.name = "ContentPipelineDisabledError";
  }
}

// ---------------------------------------------------------------------------
// Per-user settings.
// ---------------------------------------------------------------------------

export const wechatArticleReviewModes = ["every_post", "jev_guarded"] as const;
export const wechatArticleThemes = ["default", "grace", "simple"] as const;
export const xhsCardTypes = ["quote", "list", "opinion"] as const;
export type ContentPipelineChannel = "wechat_articles" | "xhs_cards";

export type LeadMagnet = {
  name: string;
  hookCopy: string;
  deliveryNote: string;
};

export type ContentPipelineSettings = {
  wechatArticlesEnabled: boolean;
  wechatReviewMode: (typeof wechatArticleReviewModes)[number];
  wechatDailyCap: number;
  wechatTheme: (typeof wechatArticleThemes)[number];
  xhsCardsEnabled: boolean;
  xhsCardType: (typeof xhsCardTypes)[number];
  xhsTheme: z.infer<typeof visualStoryThemeSchema>;
  xhsReviewMode: (typeof wechatArticleReviewModes)[number];
  xhsDailyCap: number;
  xhsWithIllustration: boolean;
  leadMagnets: LeadMagnet[];
  paused: boolean;
  pausedReason: string | null;
};

const DEFAULT_SETTINGS: ContentPipelineSettings = {
  wechatArticlesEnabled: false,
  wechatReviewMode: "every_post",
  wechatDailyCap: 1,
  wechatTheme: "default",
  xhsCardsEnabled: false,
  xhsCardType: "quote",
  xhsTheme: "editorial",
  xhsReviewMode: "every_post",
  xhsDailyCap: 1,
  xhsWithIllustration: false,
  leadMagnets: [],
  paused: false,
  pausedReason: null
};

const leadMagnetSchema = z.object({
  name: z.string().trim().min(1).max(60),
  hookCopy: z.string().trim().max(200),
  deliveryNote: z.string().trim().max(200)
});

const settingsRowSchema = z.object({
  wechat_articles_enabled: z.boolean(),
  wechat_review_mode: z.enum(wechatArticleReviewModes),
  wechat_daily_cap: z.coerce.number().int().min(0).max(3),
  wechat_theme: z.enum(wechatArticleThemes),
  xhs_cards_enabled: z.boolean(),
  xhs_card_type: z.enum(xhsCardTypes),
  // Lenient on purpose: rows written before migration 121 may still carry a
  // CoverStudio theme id; normalize to "editorial" instead of failing.
  xhs_theme: z.string().max(60).transform((value): z.infer<typeof visualStoryThemeSchema> => (
    visualStoryThemeSchema.safeParse(value).success
      ? (value as z.infer<typeof visualStoryThemeSchema>)
      : "editorial"
  )),
  // Column arrives with migration 121; rows read before it lands fall back
  // to the same default the migration sets.
  xhs_review_mode: z.enum(wechatArticleReviewModes).catch("every_post"),
  xhs_daily_cap: z.coerce.number().int().min(0).max(3),
  xhs_with_illustration: z.boolean(),
  lead_magnets: z.array(leadMagnetSchema),
  paused: z.boolean(),
  paused_reason: z.string().nullable()
});

const SETTINGS_COLUMNS = [
  "wechat_articles_enabled", "wechat_review_mode", "wechat_daily_cap", "wechat_theme",
  "xhs_cards_enabled", "xhs_card_type", "xhs_theme", "xhs_review_mode",
  "xhs_daily_cap", "xhs_with_illustration", "lead_magnets", "paused", "paused_reason"
] as const;
const LEGACY_SETTINGS_COLUMNS = SETTINGS_COLUMNS.filter((column) => column !== "xhs_review_mode") as unknown as string[];

export async function getContentPipelineSettings(
  admin: AdminClient,
  userId: string
): Promise<ContentPipelineSettings> {
  let query = admin
    .from("content_pipeline_settings")
    .select(SETTINGS_COLUMNS.join(", "))
    .eq("user_id", userId)
    .maybeSingle();
  let { data, error } = await query;
  // xhs_review_mode arrives with migration 121 — reads made before it lands
  // (e.g. the morning cron right after a code deploy) fall back gracefully.
  if (error && /xhs_review_mode|schema cache/i.test(error.message ?? "")) {
    query = admin
      .from("content_pipeline_settings")
      .select(LEGACY_SETTINGS_COLUMNS.join(", "))
      .eq("user_id", userId)
      .maybeSingle();
    ({ data, error } = await query);
  }
  if (error) throw error;
  if (!data) return DEFAULT_SETTINGS;
  const parsed = settingsRowSchema.safeParse(data);
  if (!parsed.success) return DEFAULT_SETTINGS;
  return {
    wechatArticlesEnabled: parsed.data.wechat_articles_enabled,
    wechatReviewMode: parsed.data.wechat_review_mode,
    wechatDailyCap: parsed.data.wechat_daily_cap,
    wechatTheme: parsed.data.wechat_theme,
    xhsCardsEnabled: parsed.data.xhs_cards_enabled,
    xhsCardType: parsed.data.xhs_card_type,
    xhsTheme: parsed.data.xhs_theme,
    xhsReviewMode: parsed.data.xhs_review_mode,
    xhsDailyCap: parsed.data.xhs_daily_cap,
    xhsWithIllustration: parsed.data.xhs_with_illustration,
    leadMagnets: parsed.data.lead_magnets,
    paused: parsed.data.paused,
    pausedReason: parsed.data.paused_reason
  };
}

export const contentPipelineSettingsPatchSchema = z.object({
  wechatArticlesEnabled: z.boolean().optional(),
  wechatReviewMode: z.enum(wechatArticleReviewModes).optional(),
  wechatDailyCap: z.coerce.number().int().min(0).max(3).optional(),
  wechatTheme: z.enum(wechatArticleThemes).optional(),
  xhsCardsEnabled: z.boolean().optional(),
  xhsCardType: z.enum(xhsCardTypes).optional(),
  xhsTheme: visualStoryThemeSchema.optional(),
  xhsReviewMode: z.enum(wechatArticleReviewModes).optional(),
  xhsDailyCap: z.coerce.number().int().min(0).max(3).optional(),
  xhsWithIllustration: z.boolean().optional(),
  leadMagnets: z.array(leadMagnetSchema).max(5).optional(),
  paused: z.boolean().optional(),
  pausedReason: z.string().max(500).nullable().optional()
});

export async function updateContentPipelineSettings(
  admin: AdminClient,
  userId: string,
  patch: z.infer<typeof contentPipelineSettingsPatchSchema>
): Promise<ContentPipelineSettings> {
  const row = {
    user_id: userId,
    ...(patch.wechatArticlesEnabled !== undefined ? { wechat_articles_enabled: patch.wechatArticlesEnabled } : {}),
    ...(patch.wechatReviewMode !== undefined ? { wechat_review_mode: patch.wechatReviewMode } : {}),
    ...(patch.wechatDailyCap !== undefined ? { wechat_daily_cap: patch.wechatDailyCap } : {}),
    ...(patch.wechatTheme !== undefined ? { wechat_theme: patch.wechatTheme } : {}),
    ...(patch.xhsCardsEnabled !== undefined ? { xhs_cards_enabled: patch.xhsCardsEnabled } : {}),
    ...(patch.xhsCardType !== undefined ? { xhs_card_type: patch.xhsCardType } : {}),
    ...(patch.xhsTheme !== undefined ? { xhs_theme: patch.xhsTheme } : {}),
    ...(patch.xhsDailyCap !== undefined ? { xhs_daily_cap: patch.xhsDailyCap } : {}),
    ...(patch.xhsWithIllustration !== undefined ? { xhs_with_illustration: patch.xhsWithIllustration } : {}),
    ...(patch.leadMagnets !== undefined
      ? { lead_magnets: patch.leadMagnets.map((magnet) => ({ name: magnet.name, hookCopy: magnet.hookCopy, deliveryNote: magnet.deliveryNote })) }
      : {}),
    ...(patch.paused !== undefined ? { paused: patch.paused } : {}),
    ...(patch.pausedReason !== undefined ? { paused_reason: patch.pausedReason } : {}),
    updated_at: new Date().toISOString()
  };
  let { error } = await admin
    .from("content_pipeline_settings")
    .upsert(row, { onConflict: "user_id" });
  if (!error && patch.xhsReviewMode !== undefined) {
    // Written separately so a pre-migration-121 database still accepts every
    // other settings change.
    ({ error } = await admin
      .from("content_pipeline_settings")
      .upsert({ ...row, xhs_review_mode: patch.xhsReviewMode }, { onConflict: "user_id" }));
  }
  if (error) throw error;
  return getContentPipelineSettings(admin, userId);
}

// ---------------------------------------------------------------------------
// Daily quota window (Beijing midnight, mirroring the X pipeline helper).
// ---------------------------------------------------------------------------

export function contentPipelineDailyWindowStart(now = new Date()): string {
  const cstOffsetMs = 8 * 3_600_000;
  return new Date(
    Math.floor((now.getTime() + cstOffsetMs) / 86_400_000) * 86_400_000 - cstOffsetMs
  ).toISOString();
}

/** Billed generations today for a channel (free regenerations do not count). */
export async function countBilledRunsToday(
  admin: AdminClient,
  userId: string,
  channel: ContentPipelineChannel,
  now = new Date()
): Promise<number> {
  const { count, error } = await admin
    .from("content_pipeline_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("channel", channel)
    .gte("created_at", contentPipelineDailyWindowStart(now))
    // Only runs that consumed credits count against the daily cap; the
    // extra.billed flag is omitted for free regenerations.
    .filter("extra->>billed", "eq", "true");
  if (error) throw error;
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Request guard (feature gate → pilot → session → admin client).
// ---------------------------------------------------------------------------

export type ContentPipelineRequestContext = {
  userId: string;
  admin: AdminClient;
};

export async function guardContentPipelineRequest(): Promise<
  { ok: true; context: ContentPipelineRequestContext } | { ok: false; response: NextResponse<Record<string, unknown>> }
> {
  if (!contentPipelineKillSwitchOn()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "日更流水线未对当前部署开放。" }, { status: 403 })
    };
  }
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "请先登录后再使用日更流水线。" }, { status: 401 })
    };
  }
  if (!contentPipelineEnabled(userId)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "日更流水线尚未对当前账号开放。" }, { status: 403 })
    };
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "日更流水线需要持久化存储。" }, { status: 503 })
    };
  }
  return { ok: true, context: { userId, admin } };
}

export function contentPipelineErrorResponse(error: unknown): NextResponse<Record<string, unknown>> {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "请求参数不正确。" }, { status: 400 });
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "日更流水线出现未知错误。" }, { status: 500 });
}
