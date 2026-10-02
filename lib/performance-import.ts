import { z } from "zod";
import { sendRawPrompt } from "@/lib/llm";
import { getPlatform, type PlatformId } from "@/lib/platforms";

const METRIC_FIELDS = [
  "impressions",
  "views",
  "clicks",
  "coverClickRate",
  "averageViewSeconds",
  "likes",
  "comments",
  "saves",
  "shares",
  "followerGrowth",
  "profileVisits",
  "leads",
  "signups",
  "revenue"
] as const;

export type MetricField = (typeof METRIC_FIELDS)[number];

const extractionSchema = z.object({
  metrics: z.object({
    impressions: z.number().nonnegative().default(0),
    views: z.number().nonnegative().default(0),
    clicks: z.number().nonnegative().default(0),
    coverClickRate: z.number().nonnegative().max(100).default(0),
    averageViewSeconds: z.number().nonnegative().default(0),
    likes: z.number().nonnegative().default(0),
    comments: z.number().nonnegative().default(0),
    saves: z.number().nonnegative().default(0),
    shares: z.number().nonnegative().default(0),
    followerGrowth: z.number().default(0),
    profileVisits: z.number().nonnegative().default(0),
    leads: z.number().nonnegative().default(0),
    signups: z.number().nonnegative().default(0),
    revenue: z.number().nonnegative().default(0)
  }),
  found: z.array(z.enum(METRIC_FIELDS)),
  notes: z.string()
});

export type ExtractedMetrics = z.infer<typeof extractionSchema>;

function buildImportPrompt(pastedText: string, platform: PlatformId, locale: "zh" | "en"): string {
  const platformLabel = getPlatform(platform).label;

  return `You extract social/content analytics numbers from text a user copied from a platform's own analytics dashboard (e.g. 微信公众号后台, 小红书创作中心).

Platform: ${platformLabel}

Term mapping (Chinese dashboards use varied wording for the same concept):
- 曝光 / 展现 -> impressions
- 观看数 / 阅读量 / 阅读 / 浏览量 / 小眼睛 -> views
- 点击 / 链接点击 -> clicks
- 封面点击率 -> coverClickRate (keep the displayed percentage number: "5.6%" = 5.6)
- 平均观看时长 / 人均观看时长 -> averageViewSeconds (convert minutes to seconds when needed)
- 点赞 / 赞 / 在看 -> likes
- 评论 / 留言 -> comments
- 收藏 -> saves
- 转发 / 分享 -> shares
- 涨粉 / 新增关注 / 新增粉丝 -> followerGrowth (may be negative for account-level net growth)
- 主页访客 / 主页访问 -> profileVisits
- 私信 / 咨询 / 留资 -> leads
- 注册 / 下单 -> signups
- 收入 / GMV / 佣金 -> revenue

Chinese number formats: "1.2万" = 12000, "3,456" = 3456. Parse these correctly.

Pasted text:
"""
${pastedText}
"""

Return STRICT JSON, no markdown fences, no commentary, matching exactly this shape:
{
  "metrics": { "impressions": number, "views": number, "clicks": number, "coverClickRate": number, "averageViewSeconds": number, "likes": number, "comments": number, "saves": number, "shares": number, "followerGrowth": number, "profileVisits": number, "leads": number, "signups": number, "revenue": number },
  "found": [array of the field names above that were actually present in the text — omit any field you had to default to 0],
  "notes": "one sentence in ${locale === "zh" ? "Chinese" : "English"} describing any ambiguous term mapping, or an empty string if none"
}

Never invent numbers. Any field not present in the text must be 0 and must NOT appear in "found".`;
}

/**
 * Extracts the 9 performance metric fields from text a user pasted from a
 * platform's own analytics dashboard. Returns which fields were actually
 * found so the caller only overwrites those — a value the user already
 * typed by hand is never silently zeroed out by a field the LLM didn't see.
 *
 * Throws on an unparseable/invalid LLM response — the route surfaces this
 * as a 422 rather than guessing.
 */
export async function extractMetricsFromText(
  pastedText: string,
  platform: PlatformId,
  locale: "zh" | "en"
): Promise<ExtractedMetrics> {
  const raw = await sendRawPrompt(buildImportPrompt(pastedText, platform, locale));
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = extractionSchema.parse(JSON.parse(cleaned));
  if (parsed.found.length === 0) {
    throw new Error("No recognizable metrics found in the pasted text.");
  }
  return parsed;
}
