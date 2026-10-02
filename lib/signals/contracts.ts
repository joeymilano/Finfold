import { z } from "zod";
import { DISCOVERY_PLATFORMS } from "@/lib/trends/source-catalog";
import { normalizeTrendText, scoreOpportunity, type OpportunityProfile } from "@/lib/trends/scoring";
import { validateExternalHttpUrl } from "@/lib/safe-url";
import type { JevQuestion, JevQuestions } from "@/lib/jev";

/** P(clearly irrelevant) at or above this rejects a candidate before any paid read. */
export const PRESCREEN_IRRELEVANT_MIN = 0.7;
/** Fewer unscreened pending candidates than this skips the Jev prescreen step. */
export const PRESCREEN_MIN_CANDIDATES = 3;
export const PRESCREEN_REJECT_REASON = "自动预筛：明显与业务无关，未消耗分析额度。";

export const signalKinds = ["demand", "content", "competitor", "industry"] as const;
export const candidateSchema = z.object({
  url: z.string().max(2048), title: z.string().max(300), snippet: z.string().max(1200),
  sourceLabel: z.string().max(120), platform: z.string().max(40), publishedAt: z.string().nullable(),
  evidenceLevel: z.enum(["indexed", "direct", "public_api", "metadata"]).default("indexed"),
  text: z.string().max(6000).default(""), status: z.enum(["pending", "blocked", "rejected", "recommended", "assessed"]).default("pending"),
  excerpt: z.string().max(450).optional(),
  reason: z.string().max(500).optional(), opportunityId: z.string().optional(),
  prescreen: z.enum(["kept", "rejected"]).optional()
});
export type SignalCandidate = z.infer<typeof candidateSchema>;
export const assessmentSchema = z.object({
  kind: z.enum(signalKinds), relevant: z.boolean(), matchScore: z.number().int().min(0).max(100),
  fact: z.string().min(10).max(600), excerpt: z.string().min(20).max(450),
  contentKind: z.enum(["question", "tutorial", "promotion", "announcement", "discussion", "other"]).optional(),
  demandStatus: z.enum(["unresolved", "resolved", "not_applicable"]).optional(),
  responseLanguage: z.enum(["zh", "en"]).optional(),
  whyYou: z.string().min(12).max(500), whyNow: z.string().min(8).max(400), action: z.string().min(12).max(500)
});
export type SignalAssessment = z.infer<typeof assessmentSchema>;
export type DiscoveryQuery = { query: string; platform: string; label: string; domains: string[]; language: string; kind: typeof signalKinds[number] };
export type DiscoverySourceReport = { platform: string; label: string; status: "pending" | "available" | "no_results" | "not_configured" | "failed" | "budget_exhausted"; found: number };
export type DiscoveryState = {
  profile: OpportunityProfile; profileVersion: string; phase: "search" | "read"; queries: DiscoveryQuery[]; queryIndex: number;
  candidates: SignalCandidate[]; seedVersion?: number; readCount: number; recommended: number; sources: DiscoverySourceReport[];
  queryPlan?: { status: "pending" | "ready" | "fallback"; terms: string[]; communityQuery?: string; error?: string };
  prescreen?: { skipped: number; savedCredits: number };
};
export type DiscoveryStatus = {
  status: "disabled" | "not_started" | "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
  id?: string; updatedAt?: string; error?: string | null; searchCalls: number; readCount: number; recommended: number;
  sources: DiscoverySourceReport[]; candidates: SignalCandidate[];
  credits?: { available: number; searchCost: number; analysisCost: number; estimatedRunCost: number };
  insufficientCredits?: boolean; userDisabled?: boolean;
  prescreen?: { skipped: number; savedCredits: number };
};

export function canonicalSignalUrl(raw: string): string {
  const url = validateExternalHttpUrl(raw);
  if (url.protocol !== "https:") throw new Error("Signal evidence requires HTTPS.");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  return url.toString();
}

/** Hash the actual URL: prose normalization deliberately removes URLs. */
export async function signalUrlFingerprint(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalSignalUrl(raw)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Landing/search indexes can discover a topic but cannot spend original-read slots. */
export function isSignalArticleUrl(raw: string): boolean {
  try {
    const url = new URL(canonicalSignalUrl(raw));
    if (url.hostname === "trends.google.com") return false;
    if (/(^|\.)(google\.[a-z.]+|bing\.com|baidu\.com|duckduckgo\.com)$/.test(url.hostname) && /^\/(search|s|trending)(?:\/|$)/.test(url.pathname)) return false;
    if (/(^|\.)(xiaohongshu\.com|x\.com|twitter\.com|linkedin\.com|reddit\.com)$/.test(url.hostname) && /^\/(search|search_result|explore)(?:\/|$)/.test(url.pathname)) return false;
    return true;
  } catch { return false; }
}

export function buildDiscoveryQueries(profile: OpportunityProfile, epoch: number, enabled: ReadonlySet<string>): DiscoveryQuery[] {
  const business = (profile.businessText ?? "").replace(profile.brandName ?? "", "").trim();
  const seed = [profile.offerName, ...(profile.watchlist ?? []).slice(0, 4), business.slice(0, 240), profile.audienceText?.slice(0, 120)].filter(Boolean).join(" ").slice(0, 600);
  if (!seed) return [];
  const intents = [
    ["求推荐 替代品 使用困难 未解决的问题", "recommend alternative struggling with unmet need"],
    ["案例 教程 经验 用户提问", "case study tutorial lessons customer questions"],
    ["产品更新 新功能 定价变化", "product changelog new features pricing changes"],
    ["行业变化 新趋势 公告", "industry changes emerging trends announcement"]
  ];
  return DISCOVERY_PLATFORMS.filter(platform => enabled.has(platform.key)).slice(0, 8).map((platform, index) => {
    const kindIndex = ((epoch + index) % 4 + 4) % 4;
    const language = platform.key === "public_web" ? /[\u3400-\u9fff]/.test(seed) ? "zh" : "en" : platform.locale;
    return { query: `${seed} ${intents[kindIndex][language === "zh" ? 0 : 1]}`, platform: platform.key, label: platform.label,
      domains: [...platform.domains], language, kind: signalKinds[kindIndex] };
  });
}

export function mergeCandidates(current: SignalCandidate[], incoming: SignalCandidate[]): SignalCandidate[] {
  const seen = new Set(current.map(c => canonicalSignalUrl(c.url)));
  const titles = new Set(current.map(c => normalizeTrendText(c.title)));
  const result = [...current];
  for (const value of incoming) {
    try {
      const parsed = candidateSchema.parse(value); const url = canonicalSignalUrl(parsed.url); const title = normalizeTrendText(parsed.title);
      if (!isSignalArticleUrl(url) || seen.has(url) || (title.length > 12 && titles.has(title))) continue;
      seen.add(url); titles.add(title); result.push({ ...parsed, url });
      if (result.length >= 30) break;
    } catch { /* Invalid external evidence never enters a persisted candidate set. */ }
  }
  return result.slice(0, 30);
}

export function candidateRecallScore(candidate: SignalCandidate, profile: OpportunityProfile, terms: string[] = []): number {
  const title = normalizeTrendText(candidate.title), snippet = normalizeTrendText(candidate.snippet);
  const intentScore = [...new Set(terms.map(normalizeTrendText).filter(term => term.length >= 2))]
    .reduce((sum, term) => sum + (title.includes(term) ? 10 : snippet.includes(term) ? 3 : 0), 0);
  return intentScore + scoreOpportunity({ id: candidate.url, title: candidate.title, summary: candidate.snippet,
    keywords: [], lifecycle: "new", momentumScore: 0, freshnessScore: 0, evidenceConfidence: 0, sourceCount: 1 }, profile).matchScore;
}

export function countRecommendedOpportunities(candidates: SignalCandidate[]): number {
  return new Set(candidates.filter(c => c.status === "recommended" && c.opportunityId).map(c => c.opportunityId)).size;
}

export const PRESCREEN_QUESTION_STEMS: Record<string, JevQuestion> = {
  clearly_irrelevant: {
    type: "noul",
    instructions: `Judging only from the title and snippet (the full page has not been read), is item {i} clearly unrelated to the business in brand_context — off-topic for its audience, offer, or watch topics — such that a deep read cannot produce a useful signal? When in doubt, answer low.`
  },
  kind_hint: {
    type: "choice",
    instructions: `Classify item {i} by the signal it would carry for the business if true.`,
    criteria: {
      demand: "someone describing a problem or need the business could address",
      content: "a content topic or format worth adapting for the business's own publishing",
      competitor: "a competitor's move, launch, pricing change, or traction",
      industry: "an industry shift or trend affecting the business",
      irrelevant: "clearly none of the above"
    }
  }
};

export function buildPrescreenQuestions(count: number): JevQuestions {
  const questions: JevQuestions = {};
  for (let index = 0; index < count; index += 1) {
    for (const [stem, question] of Object.entries(PRESCREEN_QUESTION_STEMS)) {
      questions[`${stem}_${index}`] = { ...question, instructions: question.instructions.replaceAll("{i}", String(index)) };
    }
  }
  return questions;
}

/** Marks screened candidates in place; missing answers stay kept (fail-open). Returns rejected count. */
export function applyPrescreenVerdicts(candidates: SignalCandidate[], answers: Record<string, unknown>): number {
  let rejected = 0;
  candidates.forEach((candidate, index) => {
    const answer = answers[`clearly_irrelevant_${index}`];
    const probability = answer && typeof answer === "object"
      && typeof (answer as Record<string, unknown>).noul === "number" ? (answer as { noul: number }).noul : null;
    if (probability !== null && probability >= PRESCREEN_IRRELEVANT_MIN) {
      candidate.prescreen = "rejected"; candidate.reason = PRESCREEN_REJECT_REASON; rejected += 1;
    } else candidate.prescreen = "kept";
  });
  return rejected;
}

/** Spread bounded reads across publishers; qualification still uses semantic evidence. */
export function nextSignalCandidate(candidates: SignalCandidate[], profile: OpportunityProfile, terms: string[] = []): SignalCandidate | undefined {
  const publisher = (candidate: SignalCandidate) => new URL(candidate.url).hostname.replace(/^www\./, "");
  const reviewed = new Map<string, number>();
  for (const candidate of candidates) if (candidate.status !== "pending") {
    const key = publisher(candidate); reviewed.set(key, (reviewed.get(key) ?? 0) + 1);
  }
  const score = (candidate: SignalCandidate) => candidateRecallScore(candidate, profile, terms) - 15 * (reviewed.get(publisher(candidate)) ?? 0);
  return candidates.filter(candidate => candidate.status === "pending" && candidate.prescreen !== "rejected").sort((a, b) => score(b) - score(a))[0];
}

export function assessmentFailure(raw: unknown, candidate: SignalCandidate, now = new Date()): string | null {
  const parsed = assessmentSchema.safeParse(raw);
  if (!parsed.success) return "分析结果缺少所需字段或有效的原文片段。";
  if (!["direct", "public_api"].includes(candidate.evidenceLevel)) return "尚未取得可核对的原文正文。";
  const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalize(candidate.text).includes(normalize(parsed.data.excerpt))) return "引用片段与原文不一致，未作为推荐。";
  const a = parsed.data;
  // Numeric claims must be present in the actual selected evidence, not just
  // somewhere else in the article. This is a mechanical check, not fact-checking.
  const numbers = (text: string) => text.normalize("NFKC").match(/\d+(?:[,.]\d+)*(?:\s*(?:%|percent|倍|万|亿|[kmb]\b))?/gi)?.map(value => value.toLowerCase().replace(/,/g, "").replace(/\s+/g, "").replace(/percent$/, "%")) ?? [];
  const supported = new Set(numbers(a.excerpt));
  if (numbers(a.fact).some(value => !supported.has(value))) return "摘要中的数字未出现在所选原文证据中，未作为推荐。";
  if (a.kind === "demand" && (!(["question", "discussion"] as Array<string | undefined>).includes(a.contentKind) || a.demandStatus !== "unresolved")) {
    return "原文未确认是尚未解决的公开求助，未作为需求推荐。";
  }
  if (a.responseLanguage === "zh" && [a.fact, a.whyYou, a.whyNow, a.action].some(value => !/[\u3400-\u9fff]/.test(value))) {
    return "推荐说明未使用业务画像的中文语言，未作为推荐。";
  }
  if (candidate.publishedAt) {
    const age = now.getTime() - Date.parse(candidate.publishedAt);
    if (!Number.isFinite(age)) return "原文发布时间无法识别。";
    if (age < -3600_000) return "原文时间晚于当前时间，需要核对。";
    if (age > 30 * 86400_000) return "原文已超过本轮 30 天的时效范围。";
  }
  return null;
}

export function verifiedAssessment(raw: unknown, candidate: SignalCandidate, now = new Date()): SignalAssessment | null {
  if (assessmentFailure(raw, candidate, now)) return null;
  const a = assessmentSchema.parse(raw);
  if (!candidate.publishedAt) a.whyNow = /[\u3400-\u9fff]/.test(a.whyNow)
    ? "发布时间未知；建议先核对原文是否仍适用。"
    : "Publication date is unknown; verify that the source remains applicable.";
  return a;
}
