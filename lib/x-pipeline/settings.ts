import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { xReviewModes } from "@/lib/x-pipeline/content";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

/** Global kill switch for every X pipeline surface (generation + publishing). */
export function xPipelineEnabled(): boolean {
  return process.env.X_PIPELINE_ENABLED === "true";
}

/** Coarse server-side visibility for the navigation entry. */
export function xPipelineVisibleForNav(): boolean {
  return xPipelineEnabled();
}

export type XPipelineSettings = {
  reviewMode: (typeof xReviewModes)[number];
  dailyPostLimit: number;
  dailyReplyLimit: number;
  generationEnabled: boolean;
  engagementEnabled: boolean;
  paused: boolean;
  pausedReason: string | null;
};

const DEFAULT_SETTINGS: XPipelineSettings = {
  reviewMode: "every_post",
  dailyPostLimit: 3,
  dailyReplyLimit: 10,
  generationEnabled: false,
  engagementEnabled: false,
  paused: false,
  pausedReason: null
};

export async function getXPipelineSettings(
  admin: AdminClient,
  userId: string
): Promise<XPipelineSettings> {
  const { data } = await admin
    .from("x_pipeline_settings")
    .select("review_mode, daily_post_limit, daily_reply_limit, generation_enabled, engagement_enabled, paused, paused_reason")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  const parsed = z
    .object({
      review_mode: z.enum(xReviewModes),
      daily_post_limit: z.coerce.number().int().min(0).max(10),
      daily_reply_limit: z.coerce.number().int().min(0).max(30),
      generation_enabled: z.boolean(),
      engagement_enabled: z.boolean(),
      paused: z.boolean(),
      paused_reason: z.string().nullable()
    })
    .safeParse(data);
  if (!parsed.success) return DEFAULT_SETTINGS;
  return {
    reviewMode: parsed.data.review_mode,
    dailyPostLimit: parsed.data.daily_post_limit,
    dailyReplyLimit: parsed.data.daily_reply_limit,
    generationEnabled: parsed.data.generation_enabled,
    engagementEnabled: parsed.data.engagement_enabled,
    paused: parsed.data.paused,
    pausedReason: parsed.data.paused_reason
  };
}

export const xPipelineSettingsPatchSchema = z.object({
  reviewMode: z.enum(xReviewModes).optional(),
  dailyPostLimit: z.coerce.number().int().min(0).max(10).optional(),
  dailyReplyLimit: z.coerce.number().int().min(0).max(30).optional(),
  generationEnabled: z.boolean().optional(),
  engagementEnabled: z.boolean().optional(),
  paused: z.boolean().optional(),
  pausedReason: z.string().max(500).nullable().optional()
});

export async function updateXPipelineSettings(
  admin: AdminClient,
  userId: string,
  patch: z.infer<typeof xPipelineSettingsPatchSchema>
): Promise<XPipelineSettings> {
  const { error } = await admin
    .from("x_pipeline_settings")
    .upsert({
      user_id: userId,
      ...(patch.reviewMode !== undefined ? { review_mode: patch.reviewMode } : {}),
      ...(patch.dailyPostLimit !== undefined ? { daily_post_limit: patch.dailyPostLimit } : {}),
      ...(patch.dailyReplyLimit !== undefined ? { daily_reply_limit: patch.dailyReplyLimit } : {}),
      ...(patch.generationEnabled !== undefined ? { generation_enabled: patch.generationEnabled } : {}),
      ...(patch.engagementEnabled !== undefined ? { engagement_enabled: patch.engagementEnabled } : {}),
      ...(patch.paused !== undefined ? { paused: patch.paused } : {}),
      ...(patch.pausedReason !== undefined ? { paused_reason: patch.pausedReason } : {}),
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
  if (error) throw error;
  return getXPipelineSettings(admin, userId);
}

export type XWatchlistEntry = {
  id: string;
  kind: "account" | "keyword";
  value: string;
  note: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export const xWatchlistInputSchema = z.object({
  kind: z.enum(["account", "keyword"]),
  value: z.string().trim().min(1).max(200),
  note: z.string().max(500).nullable().optional()
});

export async function listXWatchlist(
  admin: AdminClient,
  userId: string,
  options: { activeOnly?: boolean } = {}
): Promise<XWatchlistEntry[]> {
  let query = admin
    .from("x_watchlist")
    .select("id, kind, value, note, active, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (options.activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind as XWatchlistEntry["kind"],
    value: row.value,
    note: row.note,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function upsertXWatchlistEntry(
  admin: AdminClient,
  userId: string,
  input: z.infer<typeof xWatchlistInputSchema>
): Promise<void> {
  // Account handles arrive with or without a leading @; normalize so the
  // per-user unique constraint actually dedupes.
  const value = input.kind === "account"
    ? input.value.replace(/^@+/, "").trim()
    : input.value.trim();
  const { error } = await admin
    .from("x_watchlist")
    .upsert({
      user_id: userId,
      kind: input.kind,
      value,
      note: input.note ?? null,
      active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,kind,value" });
  if (error) throw error;
}

export async function setXWatchlistEntryActive(
  admin: AdminClient,
  userId: string,
  entryId: string,
  active: boolean
): Promise<boolean> {
  const { data, error } = await admin
    .from("x_watchlist")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** Beijing-midnight window start (CST = UTC+8, no DST), as an ISO string. */
export function xDailyWindowStart(now = new Date()): string {
  const cstOffsetMs = 8 * 3_600_000;
  return new Date(
    Math.floor((now.getTime() + cstOffsetMs) / 86_400_000) * 86_400_000 - cstOffsetMs
  ).toISOString();
}

export async function countXJobsCreatedToday(
  admin: AdminClient,
  userId: string,
  kinds: readonly ("post" | "thread" | "reply")[],
  now = new Date()
): Promise<number> {
  const { count, error } = await admin
    .from("x_publication_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("kind", [...kinds])
    .gte("created_at", xDailyWindowStart(now));
  if (error) throw error;
  return count ?? 0;
}

export type XPipelineRequestContext = {
  userId: string;
  admin: AdminClient;
};

/** Feature gate → session → admin client, mirroring the growth-loop guard. */
export async function guardXPipelineRequest(): Promise<
  { ok: true; context: XPipelineRequestContext } | { ok: false; response: NextResponse<Record<string, unknown>> }
> {
  if (!xPipelineEnabled()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "The X pipeline is not enabled for this deployment." }, { status: 403 })
    };
  }
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Please log in to use the X pipeline." }, { status: 401 })
    };
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "The X pipeline requires durable storage." }, { status: 503 })
    };
  }
  return { ok: true, context: { userId, admin } };
}

export function xPipelineErrorResponse(error: unknown): NextResponse<Record<string, unknown>> {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Unexpected X pipeline failure." }, { status: 500 });
}
