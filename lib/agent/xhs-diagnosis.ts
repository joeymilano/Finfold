import { z } from "zod";
import { sendRawPrompt, sendRawPromptWithImages } from "@/lib/llm";
import { runAgentProviderCall } from "@/lib/agent/provider-call";
import type { AgentToolContext } from "@/lib/agent/types";

const diagnosisSchema = z.object({
  accountSummary: z.string(),
  metrics: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  scores: z.array(
    z.object({
      dimension: z.string(),
      score: z.number().min(0).max(100),
      comment: z.string()
    })
  ),
  problems: z.array(
    z.object({
      title: z.string(),
      evidence: z.string(),
      severity: z.enum(["low", "medium", "high"])
    })
  ),
  actions: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      priority: z.enum(["low", "medium", "high"])
    })
  ),
  contentSuggestions: z.array(z.string())
});

export type XhsDiagnosisReport = z.infer<typeof diagnosisSchema>;

const DIAGNOSIS_INSTRUCTIONS = `You are a senior Xiaohongshu (小红书/RedNote) growth strategist producing an account diagnosis report for a creator/brand. Xiaohongshu has no public API, so you're working from what the user pasted from 创作中心 (Creator Center) and/or screenshots they uploaded.

Term mapping for pasted 创作中心 text (Chinese dashboards use varied wording):
- 曝光 / 展现 -> impressions
- 观看 / 阅读量 / 浏览量 / 小眼睛 -> views
- 封面点击率 -> coverClickRate (keep it as a percentage, e.g. 20.6 means 20.6%)
- 平均观看时长 / 平均阅读时长 -> averageViewSeconds
- 点赞 / 赞 -> likes
- 评论 / 留言 -> comments
- 收藏 -> saves
- 转发 / 分享 -> shares
- 涨粉 / 新增粉丝 -> followerGrowth
- 主页访客 / 主页访问 -> profileVisits
- 粉丝数 -> followerCount
Chinese number formats: "1.2万" = 12000, "3,456" = 3456.

Do not use universal like-count, save-rate, comment-rate, or engagement benchmarks. When enough history is supplied, compare notes only against this account's own mature (published at least 7 days) distribution using P25, median, and P75. Treat notes published fewer than 7 days ago as early signals, and state that the sample is limited when fewer than 5 mature notes are available. Missing metrics are unknown rather than zero.

Rules and directly observed evidence decide the diagnosis; your role is to explain them and suggest bounded next checks. Label claims as confirmed, supported_hypothesis, or insufficient. Never state that an account or note was limited, throttled, shadow-banned, or penalized unless the user supplies a platform notification or equivalent direct evidence. Otherwise say that the cause cannot yet be determined and name plausible alternatives.

If screenshots are attached, actually look at them: cover image style/composition, title text, visible engagement numbers, profile layout, content category — ground your diagnosis in what you actually see, don't invent details.

Score these 4 dimensions (0-100 each): 内容质量 (content quality — hook strength, visual style, information density), 流量健康度 (traffic health — impressions vs. engagement ratio, consistency), 人设清晰度 (persona clarity — is the account's identity/niche obvious within 3 seconds), 商业化潜力 (monetization potential — audience intent match, brand-safety, CTA clarity).

Return STRICT JSON, no markdown fences, no commentary, matching exactly this shape:
{
  "accountSummary": "2-3 sentence overview of what this account is and where it stands",
  "metrics": { "use standardized keys when evidenced: impressions, views, coverClickRate, averageViewSeconds, likes, comments, saves, shares, followerGrowth, profileVisits, followerCount — omit fields you have no evidence for" },
  "scores": [ { "dimension": "内容质量", "score": 0-100, "comment": "one sentence why" }, ... all 4 dimensions ],
  "problems": [ { "title": "short problem name", "evidence": "what in the data/screenshot shows this", "severity": "low"|"medium"|"high" } ],
  "actions": [ { "title": "short action name", "detail": "specific, actionable next step", "priority": "low"|"medium"|"high" } ],
  "contentSuggestions": [ "3-5 concrete content/topic ideas tailored to this account's niche and problems" ]
}

If the user provided neither pasted data nor screenshots with real information, return a report whose accountSummary explains exactly what to paste/screenshot next (创作中心 → 数据 tab, and post-detail screenshots), with empty scores/problems/actions arrays.`;

function parseJsonResponse(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

/**
 * Produces a structured Xiaohongshu account diagnosis from pasted
 * Creator-Center text and/or uploaded screenshots. Xiaohongshu has no public
 * API (see lib/performance-poll.ts), so this is the only viable data path —
 * same constraint lib/performance-import.ts already works around for
 * performance-metric entry, extended here to a full account-level report.
 */
export async function diagnoseXiaohongshuAccount(input: {
  pastedData?: string;
  imageUrls?: string[];
  accountDescription?: string;
}, ctx: AgentToolContext): Promise<XhsDiagnosisReport> {
  const sections: string[] = [DIAGNOSIS_INSTRUCTIONS];
  if (input.accountDescription) {
    sections.push(`=== ACCOUNT CONTEXT (user-provided) ===\n${input.accountDescription}`);
  }
  if (input.pastedData) {
    sections.push(`=== PASTED CREATOR CENTER DATA ===\n${input.pastedData}`);
  }
  const prompt = sections.join("\n\n");

  const imageUrls = input.imageUrls ?? [];
  const raw = await runAgentProviderCall(
    ctx,
    () => imageUrls.length > 0 ? sendRawPromptWithImages(prompt, imageUrls) : sendRawPrompt(prompt)
  );

  return diagnosisSchema.parse(parseJsonResponse(raw));
}

export type NormalizedXhsAccountMetrics = {
  impressions: number;
  views: number;
  coverClickRate: number;
  averageViewSeconds: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  followerGrowth: number;
  profileVisits: number;
};

/**
 * Normalizes both the standardized keys requested from the model and common
 * Creator Center labels. This is deliberately deterministic: the LLM reads
 * the screenshot, while persistence never guesses or invents a number.
 */
export function normalizeXhsAccountMetrics(
  metrics: Record<string, string | number>
): NormalizedXhsAccountMetrics {
  const normalized = new Map(
    Object.entries(metrics).map(([key, value]) => [normalizeMetricKey(key), parseMetricNumber(value)])
  );
  const pick = (...aliases: string[]) => {
    for (const alias of aliases) {
      const value = normalized.get(normalizeMetricKey(alias));
      if (value !== undefined) return value;
    }
    return 0;
  };

  return {
    impressions: Math.max(0, Math.round(pick("impressions", "曝光", "曝光数", "展现", "展现数"))),
    views: Math.max(0, Math.round(pick("views", "观看", "观看数", "阅读量", "浏览量", "小眼睛"))),
    coverClickRate: clamp(pick("coverClickRate", "封面点击率"), 0, 100),
    averageViewSeconds: Math.max(0, pick("averageViewSeconds", "平均观看时长", "平均阅读时长")),
    likes: Math.max(0, Math.round(pick("likes", "点赞", "点赞数", "赞"))),
    comments: Math.max(0, Math.round(pick("comments", "评论", "评论数", "留言"))),
    saves: Math.max(0, Math.round(pick("saves", "收藏", "收藏数"))),
    shares: Math.max(0, Math.round(pick("shares", "分享", "分享数", "转发", "转发数"))),
    followerGrowth: Math.round(pick("followerGrowth", "涨粉", "净涨粉", "新增粉丝", "新增关注")),
    profileVisits: Math.max(0, Math.round(pick("profileVisits", "主页访客", "主页访问", "主页访问数")))
  };
}

function normalizeMetricKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s_-]/g, "");
}

function parseMetricNumber(value: string | number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = value.trim().replace(/,/g, "");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const numeric = Number(match[0]);
  if (!Number.isFinite(numeric)) return 0;
  if (/万/.test(text)) return numeric * 10_000;
  if (/[千k]/i.test(text)) return numeric * 1_000;
  return numeric;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
