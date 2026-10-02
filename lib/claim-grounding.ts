import type { GenerateRequest, KitOutput } from "@/lib/content-schema";

const NUMBER = "[+-]?\\d+(?:,\\d{3})*(?:\\.\\d+)?(?:[kKmMbB万亿])?\\+?";

const PER_THOUSAND_CLAIM = new RegExp(
  `(${NUMBER})\\s*(followers?|saves?\\s*(?:\\+|&|and|/|和)\\s*shares?|save[-\\s/]?shares?)\\s*(?:per|/|每)\\s*(?:1\\s*,?\\s*000|thousand|千)(?:\\s*(?:views?|impressions?|次?(?:浏览|曝光)))?`,
  "giu"
);

const SUFFIX_CLAIM = new RegExp(
  `(${NUMBER})\\s*(%|％|x\\b|×|倍|秒|秒钟|分钟|小时|天|周|星期|个月|月|年|seconds?|minutes?|hours?|days?|weeks?|months?|years?|users?|customers?|clients?|followers?|views?|impressions?|likes?|comments?|saves?|shares?|leads?|signups?|subscribers?|用户|客户|粉丝|浏览|观看|曝光|点赞|评论|收藏|转发|分享|线索|注册|订阅|usd|cny|rmb|美元|人民币|元)`,
  "giu"
);

const PREFIX_CURRENCY = new RegExp(`([$¥￥£€])\\s*(${NUMBER})`, "gu");

/** A normalized number + evidence category, never the surrounding user text. */
type ClaimSignature = string;

function normalizeNumber(value: string): string {
  return value.replace(/,/g, "").toLowerCase();
}

function normalizeUnit(value: string): string {
  const unit = value.toLowerCase();
  if (unit === "%" || unit === "％") return "percent";
  if (unit === "x" || unit === "×" || unit === "倍") return "multiplier";
  if (["秒", "秒钟", "second", "seconds"].includes(unit)) return "time:second";
  if (["分钟", "minute", "minutes"].includes(unit)) return "time:minute";
  if (["小时", "hour", "hours"].includes(unit)) return "time:hour";
  if (["天", "day", "days"].includes(unit)) return "time:day";
  if (["周", "星期", "week", "weeks"].includes(unit)) return "time:week";
  if (["个月", "月", "month", "months"].includes(unit)) return "time:month";
  if (["年", "year", "years"].includes(unit)) return "time:year";
  if (["usd", "美元"].includes(unit)) return "currency:usd";
  if (["cny", "rmb", "人民币", "元"].includes(unit)) return "currency:cny";
  if (["user", "users", "用户"].includes(unit)) return "count:user";
  if (["customer", "customers", "client", "clients", "客户"].includes(unit)) {
    return "count:customer";
  }
  if (["follower", "followers", "subscriber", "subscribers", "粉丝", "订阅"].includes(unit)) {
    return "count:follower";
  }
  if (["view", "views", "浏览", "观看"].includes(unit)) return "metric:view";
  if (["impression", "impressions", "曝光"].includes(unit)) return "metric:impression";
  if (["like", "likes", "点赞"].includes(unit)) return "metric:like";
  if (["comment", "comments", "评论"].includes(unit)) return "metric:comment";
  if (["save", "saves", "收藏"].includes(unit)) return "metric:save";
  if (["share", "shares", "转发", "分享"].includes(unit)) return "metric:share";
  if (["lead", "leads", "线索"].includes(unit)) return "metric:lead";
  if (["signup", "signups", "注册"].includes(unit)) return "metric:signup";
  return unit;
}

function claimSignatures(text: string): Set<ClaimSignature> {
  const signatures = new Set<ClaimSignature>();
  const rateSpans: Array<{ start: number; end: number }> = [];

  PER_THOUSAND_CLAIM.lastIndex = 0;
  for (const match of text.matchAll(PER_THOUSAND_CLAIM)) {
    const start = match.index;
    rateSpans.push({ start, end: start + match[0].length });
    const rateUnit = /follower/i.test(match[2])
      ? "rate:follower_per_thousand"
      : "rate:save_share_per_thousand";
    signatures.add(`${normalizeNumber(match[1])}|${rateUnit}`);
  }

  SUFFIX_CLAIM.lastIndex = 0;
  for (const match of text.matchAll(SUFFIX_CLAIM)) {
    const start = match.index;
    const end = start + match[0].length;
    if (rateSpans.some((span) => start >= span.start && end <= span.end)) {
      continue;
    }
    signatures.add(`${normalizeNumber(match[1])}|${normalizeUnit(match[2])}`);
  }
  PREFIX_CURRENCY.lastIndex = 0;
  for (const match of text.matchAll(PREFIX_CURRENCY)) {
    const currency = match[1] === "$" ? "usd" : match[1] === "¥" || match[1] === "￥" ? "cny" : match[1];
    signatures.add(`${normalizeNumber(match[2])}|currency:${currency}`);
  }
  return signatures;
}

function trustedEvidence(input: GenerateRequest): string {
  const parts: string[] = [
    input.ideaText,
    ...(input.customRules ?? []),
    JSON.stringify(input.brandBrain ?? {}),
    JSON.stringify(input.xhsWorkflowContext ?? {})
  ];

  for (const examples of Object.values(input.perfExamples ?? {})) {
    for (const example of examples) {
      parts.push(example.title, example.body);
      parts.push(`${example.likes} likes`, `${example.comments} comments`);
      if (example.impressions != null) parts.push(`${example.impressions} impressions`);
      if (example.views != null) parts.push(`${example.views} views`);
      if (example.coverClickRate != null) parts.push(`${example.coverClickRate}%`);
      if (example.averageViewSeconds != null) parts.push(`${example.averageViewSeconds} seconds`);
      if (example.saves != null) parts.push(`${example.saves} saves`);
      if (example.shares != null) parts.push(`${example.shares} shares`);
      if (example.followerGrowth != null) parts.push(`${example.followerGrowth} followers`);
    }
  }

  if (input.experimentContext) {
    const baselineUnit = {
      impressions: "impressions",
      cover_click_rate: "%",
      average_view_seconds: "seconds",
      followers_per_thousand: "followers per thousand",
      save_share_per_thousand: "save-share per thousand",
      leads: "qualified leads",
      signups: "signups",
      revenue: "revenue"
    }[input.experimentContext.primaryMetricKey];

    // A mission target is an aspiration, never evidence that the result has
    // already happened. Only the measured baseline can support publishable
    // copy, and rate metrics retain their rate semantics instead of being
    // weakened into absolute follower/view claims.
    parts.push(`${input.experimentContext.baselineValue} ${baselineUnit}`);
  }

  return parts.join("\n");
}

/**
 * Finds publishable numeric claims that have no matching value + unit in a
 * trusted user/server-owned evidence source. Generic list numbering is not a
 * claim; percentages, money, durations, audience counts, and performance
 * metrics are. Only title/body/CTA are checked because notes and strategy are
 * operator guidance, not copy published as the user's factual assertion.
 *
 * This is deliberately a deterministic numeric guard, not semantic grounding:
 * it can reject common unsupported quantities, but it cannot prove that a
 * matching number refers to the same subject, event, or causal assertion.
 */
export function findUnsupportedNumericClaims(
  input: GenerateRequest,
  output: Pick<KitOutput, "title" | "body" | "cta">
): ClaimSignature[] {
  const supported = claimSignatures(trustedEvidence(input));
  const claimed = claimSignatures(
    [output.title, output.body, output.cta].join("\n")
  );
  return [...claimed].filter((signature) => !supported.has(signature));
}
