import type { KitOutput } from "@/lib/content-schema";
import type { BrandBrain } from "@/lib/brand-brain";

export type ScoreDimension = {
  key: string;
  labelZh: string;
  labelEn: string;
  score: number; // 0–100
  reasonZh: string;
  reasonEn: string;
};

export type QualityScore = {
  overall: number;
  grade: "A" | "B" | "C" | "D";
  dimensions: ScoreDimension[];
};

/* Platform char limits for native-length scoring */
const PLATFORM_IDEAL_LENGTHS: Record<string, { min: number; max: number }> = {
  wechat: { min: 400, max: 5000 },
  xiaohongshu: { min: 100, max: 1000 },
  moments: { min: 50, max: 400 },
  x: { min: 50, max: 280 },
  linkedin: { min: 300, max: 3000 },
  reddit: { min: 200, max: 2000 },
  "product-hunt": { min: 200, max: 800 },
  threads: { min: 30, max: 500 },
  "hacker-news": { min: 100, max: 1500 },
  "indie-hackers": { min: 200, max: 2000 },
  "medium-substack": { min: 600, max: 8000 },
};

/* Patterns that signal salesy/ad-like tone */
const AD_PATTERNS = [
  /限时/i, /抢购/i, /立即购买/i, /buy now/i, /limited time/i, /act now/i,
  /！！/i, /!!/, /点击链接/i, /click here/i, /exclusive deal/i,
];

/* Patterns signaling a clear CTA */
const CTA_PATTERNS = [
  /关注/i, /订阅/i, /评论/i, /分享/i, /试试/i, /了解更多/i,
  /follow/i, /subscribe/i, /comment/i, /share/i, /try/i, /learn more/i,
  /sign up/i, /注册/i, /link in bio/i,
];

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/* 1. Platform nativeness: body length within ideal range */
function scorePlatformNativeness(output: KitOutput): ScoreDimension {
  const ideal = PLATFORM_IDEAL_LENGTHS[output.platform];
  const len = (output.title + " " + output.body).length;

  let score = 100;
  let reasonZh = "长度和格式与平台高度契合";
  let reasonEn = "Length and format match platform norms";

  if (ideal) {
    if (len < ideal.min) {
      const ratio = len / ideal.min;
      score = clamp(40 + ratio * 60);
      reasonZh = `内容偏短（${len} 字），该平台建议 ${ideal.min}–${ideal.max} 字`;
      reasonEn = `Content too short (${len} chars); platform expects ${ideal.min}–${ideal.max}`;
    } else if (len > ideal.max) {
      const excess = (len - ideal.max) / ideal.max;
      score = clamp(100 - excess * 50);
      reasonZh = `内容偏长（${len} 字），平台上限约 ${ideal.max} 字`;
      reasonEn = `Content too long (${len} chars); platform cap ~${ideal.max}`;
    }
  }

  return { key: "platform", labelZh: "平台原生度", labelEn: "Platform Nativeness", score, reasonZh, reasonEn };
}

/* 2. CTA strength: presence of clear call-to-action */
function scoreCTAStrength(output: KitOutput): ScoreDimension {
  const fullText = [output.title, output.body, output.cta].join(" ");
  const hasExplicitCTA = output.cta.length > 5;
  const hasInlineSignal = CTA_PATTERNS.some((p) => p.test(fullText));

  let score = 50;
  if (hasExplicitCTA && hasInlineSignal) score = 95;
  else if (hasExplicitCTA) score = 75;
  else if (hasInlineSignal) score = 65;

  const reasonZh = score >= 75 ? "有明确的行动指引" : "CTA 不够清晰，建议加入关注/订阅/评论等引导";
  const reasonEn = score >= 75 ? "Clear call to action present" : "Weak CTA — add follow/subscribe/comment prompt";

  return { key: "cta", labelZh: "CTA 强度", labelEn: "CTA Strength", score, reasonZh, reasonEn };
}

/* 3. Ad-risk: absence of salesy / spammy signals */
function scoreAdRisk(output: KitOutput): ScoreDimension {
  const fullText = [output.title, output.body, output.cta].join(" ");
  const hitCount = AD_PATTERNS.filter((p) => p.test(fullText)).length;
  const score = clamp(100 - hitCount * 20);

  const reasonZh = score >= 80 ? "语气自然，无明显广告感" : `检测到 ${hitCount} 处推销性表达，建议替换`;
  const reasonEn = score >= 80 ? "Natural tone, no ad-like patterns" : `Found ${hitCount} salesy phrase(s) — consider rephrasing`;

  return { key: "ad_risk", labelZh: "广告感风险", labelEn: "Ad Risk", score, reasonZh, reasonEn };
}

/* 4. Brand consistency: checks banned phrases & tone keywords */
function scoreBrandConsistency(output: KitOutput, brain: BrandBrain): ScoreDimension {
  const fullText = [output.title, output.body, output.cta].join(" ");

  // Check banned phrases
  const bannedHits = brain.bannedPhrases.filter(
    (phrase) => phrase.length > 1 && fullText.toLowerCase().includes(phrase.toLowerCase())
  );

  // Check tone keywords presence (reward if at least half present)
  const toneKeywords = brain.toneKeywords.filter((kw) => kw.length > 0);
  const toneHits = toneKeywords.filter(
    (kw) => fullText.toLowerCase().includes(kw.toLowerCase())
  ).length;
  const toneRatio = toneKeywords.length > 0 ? toneHits / toneKeywords.length : 0.5;

  const bannedPenalty = bannedHits.length * 25;
  const toneBonus = toneKeywords.length > 0 ? Math.round(toneRatio * 30) : 0;

  // Base 70 if no brain configured; 80 if brain configured but not checking
  const base = brain.brandName ? 70 : 60;
  const score = clamp(base + toneBonus - bannedPenalty);

  let reasonZh: string;
  let reasonEn: string;

  if (!brain.brandName) {
    reasonZh = "未配置品牌记忆，暂时无法做品牌一致性检测";
    reasonEn = "Brand Memory is not configured — fill it in for better scoring";
  } else if (bannedHits.length > 0) {
    reasonZh = `包含 ${bannedHits.length} 个禁用词："${bannedHits[0]}"`;
    reasonEn = `Contains ${bannedHits.length} banned phrase(s): "${bannedHits[0]}"`;
  } else if (toneRatio >= 0.5) {
    reasonZh = "语气关键词覆盖充分，与品牌调性一致";
    reasonEn = "Tone keywords well-represented, matches brand voice";
  } else {
    reasonZh = "语气关键词覆盖不足，建议参考品牌规则调整";
    reasonEn = "Few tone keywords detected — revisit your Brand Memory guidelines";
  }

  return { key: "brand", labelZh: "品牌一致性", labelEn: "Brand Consistency", score, reasonZh, reasonEn };
}

/* 5. Clarity: checks title length and structural completeness */
function scoreClarity(output: KitOutput): ScoreDimension {
  const titleLen = output.title.trim().length;
  const bodyLen = output.body.trim().length;
  const ctaLen = output.cta.trim().length;

  let score = 100;
  const issues: string[] = [];
  const issuesEn: string[] = [];

  if (titleLen < 5) { score -= 30; issues.push("标题太短"); issuesEn.push("title too short"); }
  if (titleLen > 80) { score -= 15; issues.push("标题过长"); issuesEn.push("title too long"); }
  if (bodyLen < 30) { score -= 30; issues.push("正文太少"); issuesEn.push("body too thin"); }
  if (ctaLen < 5) { score -= 20; issues.push("缺少 CTA"); issuesEn.push("missing CTA"); }

  const reasonZh = issues.length > 0 ? `${issues.join("、")}` : "标题、正文、CTA 结构完整清晰";
  const reasonEn = issuesEn.length > 0 ? issuesEn.join(", ") : "Title, body, and CTA are complete and clear";

  return { key: "clarity", labelZh: "结构清晰度", labelEn: "Clarity", score: clamp(score), reasonZh, reasonEn };
}

/* 6. English naturalness (for English content) */
function scoreEnglishNaturalness(output: KitOutput): ScoreDimension {
  const fullText = output.body;
  const chineseRatio = (fullText.match(/[一-鿿]/g) ?? []).length / Math.max(fullText.length, 1);

  // If mostly Chinese content → not applicable, give neutral 80
  if (chineseRatio > 0.3) {
    return {
      key: "english", labelZh: "英文自然度", labelEn: "English Fluency",
      score: 80,
      reasonZh: "主要为中文内容，英文自然度不适用",
      reasonEn: "Primarily Chinese content — not applicable"
    };
  }

  // Check for awkward machine-translation patterns
  const awkwardPatterns = [
    /\bvery very\b/i, /\bas follow\b/i, /\bsuch as follow\b/i,
    /\bwe are a\b.*\bcompany\b/i, /\bwelcome to contact\b/i,
  ];
  const hitCount = awkwardPatterns.filter((p) => p.test(fullText)).length;
  const score = clamp(90 - hitCount * 20);

  const reasonZh = score >= 80 ? "英文表达自然流畅" : "部分表达有机器翻译痕迹，建议人工润色";
  const reasonEn = score >= 80 ? "English reads naturally" : "Some phrases sound machine-translated — consider editing";

  return { key: "english", labelZh: "英文自然度", labelEn: "English Fluency", score, reasonZh, reasonEn };
}

/* Aggregate all dimensions into an overall score */
export function computeQualityScore(output: KitOutput, brain: BrandBrain): QualityScore {
  const dimensions: ScoreDimension[] = [
    scorePlatformNativeness(output),
    scoreCTAStrength(output),
    scoreAdRisk(output),
    scoreBrandConsistency(output, brain),
    scoreClarity(output),
    scoreEnglishNaturalness(output),
  ];

  const weights = [0.25, 0.20, 0.15, 0.20, 0.10, 0.10];
  const overall = clamp(
    dimensions.reduce((acc, dim, i) => acc + dim.score * weights[i], 0)
  );

  const grade: QualityScore["grade"] =
    overall >= 85 ? "A" : overall >= 70 ? "B" : overall >= 55 ? "C" : "D";

  return { overall, grade, dimensions };
}

/* Compute per-platform scores for an array of outputs */
export function computeKitScores(
  outputs: KitOutput[],
  brain: BrandBrain
): Record<string, QualityScore> {
  return Object.fromEntries(
    outputs.map((output) => [output.platform, computeQualityScore(output, brain)])
  );
}
