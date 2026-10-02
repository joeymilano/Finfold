import type { createSupabaseAdminClient } from "@/lib/supabase";
import {
  trendSourcePreferenceKeySchema,
  type TrendSource,
  type TrendSourcePreferenceKey
} from "@/lib/trends/types";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const USER_METADATA_KEY = "trend_source_preferences";

export const DEFAULT_TREND_SOURCE_KEYS = trendSourcePreferenceKeySchema.options;

export function trendSourcePreferenceKey(
  source: TrendSource | string,
  label: string
): TrendSourcePreferenceKey | null {
  if (source === "google_trends") return "google_trends";
  if (source === "hacker_news") return "hacker_news";
  if (source === "aihot" || /^AIHOT$/i.test(label.trim())) return "aihot";
  if (/^(Hacker News|Ask HN|Show HN)$/i.test(label.trim())) return "hacker_news";
  if (/^GitHub · /i.test(label.trim())) return "github";
  if (label.trim() === "Google Trends") return "google_trends";
  if (source === "social_post" && /^Reddit\b/i.test(label.trim())) return "reddit";

  const normalized = label.trim().toLocaleLowerCase("en-US");
  const named: Record<string, TrendSourcePreferenceKey> = { "人人都是产品经理": "woshipm", "阮一峰周刊": "ruanyifeng", "oschina": "oschina", "it之家": "ithome", "n8n 功能请求": "n8n", "github · gitroomhq/postiz-app": "github", "小红书": "xiaohongshu", "b站": "bilibili", "公众号": "wechat_search", "微博": "weibo", "x": "x", "linkedin": "linkedin", "reddit": "reddit", "公开网页": "public_web" };
  if (named[normalized]) return named[normalized];
  if (normalized === "product hunt") return "product_hunt";
  if (normalized === "the verge") return "the_verge";
  if (normalized === "google ai") return "google_ai";
  if (normalized === "少数派") return "sspai";
  if (normalized === "爱范儿") return "ifanr";
  if (normalized.startsWith("百度热搜")) return "baidu_hot_search";
  if (normalized.startsWith("百度指数")) return "baidu_index";
  if (normalized.startsWith("微信搜一搜")) return "wechat_search";
  return null;
}

export function isTrendSourceEnabled(
  source: TrendSource | string,
  label: string,
  enabledKeys: ReadonlySet<TrendSourcePreferenceKey>
): boolean {
  const key = trendSourcePreferenceKey(source, label);
  return key ? enabledKeys.has(key) : true;
}

export async function loadTrendSourcePreferences(
  admin: AdminClient,
  userId: string
): Promise<Set<TrendSourcePreferenceKey>> {
  try {
    const authAdmin = authAdminClient(admin);
    if (!authAdmin?.getUserById) return new Set(DEFAULT_TREND_SOURCE_KEYS);
    const { data, error } = await authAdmin.getUserById(userId);
    if (error) throw error;
    return parseStoredPreference(data?.user?.user_metadata?.[USER_METADATA_KEY]);
  } catch (error) {
    console.warn("[opportunity-radar] source preferences unavailable; using defaults", error);
    return new Set(DEFAULT_TREND_SOURCE_KEYS);
  }
}

export async function saveTrendSourcePreferences(
  admin: AdminClient,
  userId: string,
  enabledKeys: TrendSourcePreferenceKey[]
): Promise<Set<TrendSourcePreferenceKey>> {
  const normalized = normalizeEnabledKeys(enabledKeys);
  if (!normalized.length) throw new Error("At least one trend source must remain enabled.");

  const authAdmin = authAdminClient(admin);
  if (!authAdmin?.getUserById || !authAdmin.updateUserById) {
    throw new Error("Source preference storage is unavailable.");
  }
  const { data: current, error: readError } = await authAdmin.getUserById(userId);
  if (readError) throw readError;
  const metadata = current?.user?.user_metadata && typeof current.user.user_metadata === "object"
    ? current.user.user_metadata
    : {};
  const { error: updateError } = await authAdmin.updateUserById(userId, {
    user_metadata: {
      ...metadata,
      [USER_METADATA_KEY]: {
        enabled: normalized,
        updatedAt: new Date().toISOString()
      }
    }
  });
  if (updateError) throw updateError;
  return new Set(normalized);
}

function parseStoredPreference(value: unknown): Set<TrendSourcePreferenceKey> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Set(DEFAULT_TREND_SOURCE_KEYS);
  }
  const enabled = "enabled" in value ? (value as { enabled?: unknown }).enabled : undefined;
  if (!Array.isArray(enabled)) return new Set(DEFAULT_TREND_SOURCE_KEYS);
  const normalized = normalizeEnabledKeys(enabled);
  return normalized.length ? new Set(normalized) : new Set(DEFAULT_TREND_SOURCE_KEYS);
}

function normalizeEnabledKeys(values: unknown[]): TrendSourcePreferenceKey[] {
  return [...new Set(values.flatMap((value) => {
    const parsed = trendSourcePreferenceKeySchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  }))];
}

function authAdminClient(admin: AdminClient): {
  getUserById?: (userId: string) => Promise<{ data: { user: { user_metadata?: Record<string, unknown> } | null }; error: unknown }>;
  updateUserById?: (userId: string, attributes: { user_metadata: Record<string, unknown> }) => Promise<{ error: unknown }>;
} | undefined {
  return (admin as unknown as {
    auth?: { admin?: {
      getUserById?: (userId: string) => Promise<{ data: { user: { user_metadata?: Record<string, unknown> } | null }; error: unknown }>;
      updateUserById?: (userId: string, attributes: { user_metadata: Record<string, unknown> }) => Promise<{ error: unknown }>;
    } };
  }).auth?.admin;
}
