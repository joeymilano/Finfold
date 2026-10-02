import type { KitOutput } from "@/lib/content-schema";
import { assessHumanWriting } from "@/lib/human-writing";

type VisibleOutput = Pick<KitOutput, "title" | "body" | "cta">;

export type ToneBaselineSource = "performance" | "brand_memory" | "mixed";
export type ToneConfidence = "high" | "medium" | "low";
export type ToneAlignmentStatus = "unavailable" | "aligned" | "watch" | "drift";

export type ToneProfile = {
  opening: "question" | "list" | "story" | "statement";
  averageSentenceLength: number;
  averageParagraphLength: number;
  shortParagraphRatio: number;
  emojiPerHundredChars: number;
  hashtagPerHundredChars: number;
  emphaticPunctuationPerHundredChars: number;
  ctaStrength: number;
  promotionalLanguage: number;
  humanVoice: number;
  toneKeywordCoverage: number;
};

export type ToneBaseline = {
  source: ToneBaselineSource;
  confidence: ToneConfidence;
  sampleCount: number;
  performanceSampleCount: number;
  brandMemorySampleCount: number;
  consistency: number;
  profile: ToneProfile;
};

export type ToneDifference = {
  key: keyof Omit<ToneProfile, "opening"> | "opening";
  direction: "higher" | "lower" | "different";
  weight: number;
  reasonEn: string;
  reasonZh: string;
  suggestionEn: string;
  suggestionZh: string;
};

export type ToneDriftAssessment = {
  status: ToneAlignmentStatus;
  score: number | null;
  confidence: ToneConfidence | null;
  baseline: ToneBaseline | null;
  differences: ToneDifference[];
  directionEn: string | null;
  directionZh: string | null;
};

export type ToneBaselineInput = {
  performanceExamples?: VisibleOutput[];
  brandMemoryExamples?: VisibleOutput[];
  toneKeywords?: string[];
};

const FEATURE_WEIGHTS = {
  opening: 11,
  averageSentenceLength: 12,
  averageParagraphLength: 7,
  shortParagraphRatio: 8,
  emojiPerHundredChars: 6,
  hashtagPerHundredChars: 6,
  emphaticPunctuationPerHundredChars: 7,
  ctaStrength: 10,
  promotionalLanguage: 10,
  humanVoice: 13,
  toneKeywordCoverage: 10
} as const;

const TOTAL_WEIGHT = Object.values(FEATURE_WEIGHTS).reduce((total, value) => total + value, 0);
const ADVISORY_SCORE = 55;
const WATCH_SCORE = 75;

const CTA_PATTERNS = [
  /\b(reply|comment|share|follow|subscribe|try|read|join|sign up)\b/iu,
  /关注|评论|分享|订阅|试试|了解更多|注册/u
];

const PROMOTIONAL_PATTERNS = [
  /\b(game-changing|revolutionary|groundbreaking|cutting-edge|best-in-class|must-have|unlock|transform)\b/giu,
  /限时|立即购买|颠覆性|革命性|重磅/u
];

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function normalizeText(output: VisibleOutput): string {
  return [output.title, output.body, output.cta].filter(Boolean).join("\n").trim();
}

function sentences(text: string): string[] {
  return text
    .split(/[。！？.!?]+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function openingKind(text: string): ToneProfile["opening"] {
  const opening = text.slice(0, 180).trim();
  const firstSentence = opening.split(/[。！？.!?]/u, 1)[0] ?? opening;
  if (/^(?:\d+\.|[一二三四五六七八九十]+、|[-*])/u.test(opening)) return "list";
  if (/[?？]/u.test(firstSentence)) return "question";
  if (/\b(i|we|when|last|yesterday|today)\b|我|我们|昨天|上周|这周/u.test(opening)) return "story";
  return "statement";
}

function countMatches(text: string, expression: RegExp): number {
  const flags = expression.flags.includes("g") ? expression.flags : `${expression.flags}g`;
  return [...text.matchAll(new RegExp(expression.source, flags))].length;
}

function countPromotionalPhrases(text: string): number {
  return PROMOTIONAL_PATTERNS.reduce((count, pattern) => count + countMatches(text, pattern), 0);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function profileAverage(profiles: ToneProfile[]): ToneProfile {
  return {
    opening: mostCommon(profiles.map((profile) => profile.opening)),
    averageSentenceLength: average(profiles.map((profile) => profile.averageSentenceLength)),
    averageParagraphLength: average(profiles.map((profile) => profile.averageParagraphLength)),
    shortParagraphRatio: average(profiles.map((profile) => profile.shortParagraphRatio)),
    emojiPerHundredChars: average(profiles.map((profile) => profile.emojiPerHundredChars)),
    hashtagPerHundredChars: average(profiles.map((profile) => profile.hashtagPerHundredChars)),
    emphaticPunctuationPerHundredChars: average(profiles.map((profile) => profile.emphaticPunctuationPerHundredChars)),
    ctaStrength: average(profiles.map((profile) => profile.ctaStrength)),
    promotionalLanguage: average(profiles.map((profile) => profile.promotionalLanguage)),
    humanVoice: average(profiles.map((profile) => profile.humanVoice)),
    toneKeywordCoverage: average(profiles.map((profile) => profile.toneKeywordCoverage))
  };
}

function blendVoiceAnchors(performanceProfile: ToneProfile, brandProfile: ToneProfile): ToneProfile {
  return {
    ...performanceProfile,
    // Brand Memory examples do not carry platform metadata. Let them enrich
    // only voice-quality signals, never the platform's normal CTA, hashtag,
    // punctuation, sentence, or paragraph rhythm.
    humanVoice: performanceProfile.humanVoice * 0.75 + brandProfile.humanVoice * 0.25,
    toneKeywordCoverage: performanceProfile.toneKeywordCoverage * 0.75 + brandProfile.toneKeywordCoverage * 0.25
  };
}

function mostCommon<T extends string>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return values.reduce((best, value) => (counts.get(value) ?? 0) > (counts.get(best) ?? 0) ? value : best);
}

function normalizedDifference(key: keyof Omit<ToneProfile, "opening">, actual: number, expected: number): number {
  const scale: Record<keyof Omit<ToneProfile, "opening">, number> = {
    averageSentenceLength: 24,
    averageParagraphLength: 180,
    shortParagraphRatio: 0.7,
    emojiPerHundredChars: 4,
    hashtagPerHundredChars: 5,
    emphaticPunctuationPerHundredChars: 4,
    ctaStrength: 100,
    promotionalLanguage: 5,
    humanVoice: 100,
    toneKeywordCoverage: 1
  };
  return Math.min(1, Math.abs(actual - expected) / scale[key]);
}

function baselineConsistency(profiles: ToneProfile[], baseline: ToneProfile): number {
  if (profiles.length < 2) return 45;
  const dimensions = (Object.keys(FEATURE_WEIGHTS) as Array<keyof typeof FEATURE_WEIGHTS>)
    .filter((key): key is keyof Omit<ToneProfile, "opening"> => key !== "opening");
  const numericDifference = average(profiles.flatMap((profile) => dimensions.map((key) => normalizedDifference(key, profile[key], baseline[key]))));
  const openingAgreement = profiles.filter((profile) => profile.opening === baseline.opening).length / profiles.length;
  return clamp(100 - numericDifference * 70 - (1 - openingAgreement) * 30);
}

function confidenceFor(source: ToneBaselineSource, performanceSampleCount: number, consistency: number): ToneConfidence {
  if (source === "performance" && performanceSampleCount >= 3 && consistency >= 70) return "high";
  if ((source === "performance" || source === "mixed") && performanceSampleCount >= 2 && consistency >= 55) return "medium";
  return "low";
}

export function extractToneProfile(output: VisibleOutput, toneKeywords: string[] = []): ToneProfile {
  const text = normalizeText(output);
  const bodyParagraphs = paragraphs(output.body);
  const allSentences = sentences(text);
  const chars = Math.max(text.length, 1);
  const meaningfulToneKeywords = toneKeywords.map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 1);
  const toneKeywordHits = meaningfulToneKeywords.filter((keyword) => text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())).length;
  const humanWriting = assessHumanWriting({ title: output.title, body: output.body, cta: output.cta });

  return {
    opening: openingKind(text),
    averageSentenceLength: average(allSentences.map((sentence) => sentence.length)),
    averageParagraphLength: average(bodyParagraphs.map((paragraph) => paragraph.length)),
    shortParagraphRatio: bodyParagraphs.length === 0 ? 0 : bodyParagraphs.filter((paragraph) => paragraph.length <= 70).length / bodyParagraphs.length,
    emojiPerHundredChars: countMatches(text, /[\p{Extended_Pictographic}]/gu) / chars * 100,
    hashtagPerHundredChars: countMatches(text, /#[\p{L}\p{N}_]+/gu) / chars * 100,
    emphaticPunctuationPerHundredChars: countMatches(text, /[!！]{1,}/gu) / chars * 100,
    ctaStrength: CTA_PATTERNS.some((pattern) => pattern.test(output.cta)) ? 100 : CTA_PATTERNS.some((pattern) => pattern.test(text)) ? 60 : 0,
    promotionalLanguage: countPromotionalPhrases(text),
    humanVoice: humanWriting.score,
    toneKeywordCoverage: meaningfulToneKeywords.length === 0 ? 0 : toneKeywordHits / meaningfulToneKeywords.length
  };
}

export function buildToneBaseline(input: ToneBaselineInput): ToneBaseline | null {
  const performanceExamples = input.performanceExamples ?? [];
  const brandMemoryExamples = input.brandMemoryExamples ?? [];
  const source: ToneBaselineSource = performanceExamples.length > 0 && brandMemoryExamples.length > 0
    ? "mixed"
    : performanceExamples.length > 0
      ? "performance"
      : "brand_memory";
  const examples = source === "performance"
    ? performanceExamples
    : source === "brand_memory"
      ? brandMemoryExamples
      : [...performanceExamples, ...brandMemoryExamples];

  if (examples.length === 0) return null;

  const performanceProfiles = performanceExamples.map((example) => extractToneProfile(example, input.toneKeywords));
  const brandProfiles = brandMemoryExamples.map((example) => extractToneProfile(example, input.toneKeywords));
  const profiles = source === "brand_memory" ? brandProfiles : performanceProfiles;
  const performanceProfile = performanceProfiles.length > 0 ? profileAverage(performanceProfiles) : null;
  const brandProfile = brandProfiles.length > 0 ? profileAverage(brandProfiles) : null;
  const profile = performanceProfile && brandProfile
    ? blendVoiceAnchors(performanceProfile, brandProfile)
    : performanceProfile ?? brandProfile!;
  const consistency = baselineConsistency(profiles, profile);
  return {
    source,
    confidence: confidenceFor(source, performanceExamples.length, consistency),
    sampleCount: examples.length,
    performanceSampleCount: performanceExamples.length,
    brandMemorySampleCount: brandMemoryExamples.length,
    consistency,
    profile
  };
}

function differenceFor(
  key: ToneDifference["key"],
  actual: number | ToneProfile["opening"],
  expected: number | ToneProfile["opening"]
): ToneDifference | null {
  if (key === "opening") {
    if (actual === expected) return null;
    return {
      key,
      direction: "different",
      weight: FEATURE_WEIGHTS.opening,
      reasonEn: `Your opening is ${actual}; your reference posts usually open with a ${expected}.`,
      reasonZh: `当前开头更像「${openingLabelZh(actual as ToneProfile["opening"])}」，参考内容通常以「${openingLabelZh(expected as ToneProfile["opening"])}」切入。`,
      suggestionEn: `Rework the first line into a ${expected} opening while keeping the current facts.`,
      suggestionZh: `保留当前事实，把首句改成更接近「${openingLabelZh(expected as ToneProfile["opening"])}」的切入方式。`
    };
  }

  const numericKey = key as keyof Omit<ToneProfile, "opening">;
  const actualValue = actual as number;
  const expectedValue = expected as number;
  const difference = normalizedDifference(numericKey, actualValue, expectedValue);
  if (difference < 0.35) return null;
  const direction = actualValue > expectedValue ? "higher" : "lower";
  const copy = differenceCopy(numericKey, direction);
  return {
    key: numericKey,
    direction,
    weight: FEATURE_WEIGHTS[numericKey],
    reasonEn: copy.reasonEn,
    reasonZh: copy.reasonZh,
    suggestionEn: copy.suggestionEn,
    suggestionZh: copy.suggestionZh
  };
}

function openingLabelZh(opening: ToneProfile["opening"]): string {
  return { question: "提问", list: "清单", story: "经历", statement: "直接判断" }[opening];
}

function differenceCopy(key: keyof Omit<ToneProfile, "opening">, direction: "higher" | "lower") {
  const higher = direction === "higher";
  const descriptions = {
    averageSentenceLength: higher
      ? ["Your sentences run longer than this voice baseline.", "当前句子比参考语气更长。", "Use shorter, more direct sentences without removing substance.", "保留信息密度，把长句拆成更直接的表达。"]
      : ["Your sentences are shorter and more fragmented than this voice baseline.", "当前句子比参考语气更短、更碎。", "Join the key thought into a more considered sentence.", "将核心判断连成更完整的一句。"],
    averageParagraphLength: higher
      ? ["Your paragraphs are denser than the reference posts.", "当前段落比参考内容更密集。", "Add deliberate paragraph breaks around the key shift or evidence.", "在关键转折或证据处增加自然分段。"]
      : ["Your paragraphs are sparser than the reference posts.", "当前段落比参考内容更零散。", "Combine related lines where they form one thought.", "把属于同一判断的句子合并为自然段。"],
    shortParagraphRatio: higher
      ? ["The draft relies on more short paragraphs than the reference voice.", "当前短段落比例高于参考语气。", "Vary the rhythm by combining a few adjacent short lines.", "合并少量相邻短句，拉开段落节奏。"]
      : ["The draft has fewer short pauses than the reference voice.", "当前短段落停顿少于参考语气。", "Break out the strongest line so the rhythm can breathe.", "把最有力的一句单独成段，让节奏有停顿。"],
    emojiPerHundredChars: higher
      ? ["The draft uses more emoji than the reference voice.", "当前表情符号多于参考语气。", "Remove decorative emoji that do not carry meaning.", "移除不承载信息的装饰性表情。"]
      : ["The draft uses fewer emoji than the reference voice.", "当前表情符号少于参考语气。", "Only add an emoji where it matches the platform and carries intent.", "只在符合平台表达且确有意图时补充表情。"],
    hashtagPerHundredChars: higher
      ? ["The draft uses more hashtags than the reference voice.", "当前标签密度高于参考语气。", "Keep only the hashtags that help discovery.", "只保留能帮助分发的核心标签。"]
      : ["The draft uses fewer hashtags than the reference voice.", "当前标签密度低于参考语气。", "Add only the established discovery tags if they remain useful.", "若仍有分发价值，仅补充惯用核心标签。"],
    emphaticPunctuationPerHundredChars: higher
      ? ["The draft is more emphatic than the reference voice.", "当前感叹语气强于参考内容。", "Let the evidence carry the emphasis instead of repeated exclamation marks.", "让事实本身承担强调，不要连续使用感叹号。"]
      : ["The draft is less emphatic than the reference voice.", "当前表达强度低于参考内容。", "State the strongest consequence more directly.", "更直接地说出最重要的结果或后果。"],
    ctaStrength: higher
      ? ["The call to action is more forceful than the reference voice.", "当前行动引导强于参考语气。", "Soften the CTA into an invitation or question.", "把 CTA 调整为邀请或问题式引导。"]
      : ["The draft has a weaker call to action than the reference voice.", "当前行动引导弱于参考语气。", "End with one clear, natural next step.", "结尾补一个清晰、自然的下一步。"],
    promotionalLanguage: higher
      ? ["The draft uses more promotional language than the reference voice.", "当前推广性表达多于参考语气。", "Replace broad claims with a concrete limit, action, or outcome.", "用具体限制、动作或结果替换宽泛宣传词。"]
      : ["The draft is less promotional than the reference voice.", "当前推广性表达低于参考语气。", "Keep the factual voice; do not add promotion unless it serves the post.", "保持事实表达，除非内容需要，不必补强推广语。"],
    humanVoice: higher
      ? ["The draft has fewer templated signals than the reference voice.", "当前模板化表达少于参考内容。", "Keep the direct language while preserving the intended voice.", "保持直接表达，同时保留原有语气。"]
      : ["The draft contains more templated or generic language than the reference voice.", "当前模板化或泛化表达多于参考内容。", "Replace the generic phrases with specific facts, judgment, or consequences.", "用具体事实、判断或后果替换泛化表达。"],
    toneKeywordCoverage: higher
      ? ["The draft repeats more tone keywords than the reference voice.", "当前语气关键词重复高于参考内容。", "Keep only the tone language that sounds natural in context.", "只保留在当前语境中自然的语气词。"]
      : ["The draft reflects fewer configured tone keywords than the reference voice.", "当前品牌语气关键词覆盖低于参考内容。", "Bring one natural tone cue into the opening or closing.", "在开头或结尾自然加入一个品牌语气线索。"]
  } as const;
  const [reasonEn, reasonZh, suggestionEn, suggestionZh] = descriptions[key];
  return { reasonEn, reasonZh, suggestionEn, suggestionZh };
}

export function assessToneAlignment(output: VisibleOutput, baseline: ToneBaseline | null, toneKeywords: string[] = []): ToneDriftAssessment {
  if (!baseline) {
    return { status: "unavailable", score: null, confidence: null, baseline: null, differences: [], directionEn: null, directionZh: null };
  }

  const profile = extractToneProfile(output, toneKeywords);
  const differences = (Object.keys(FEATURE_WEIGHTS) as Array<keyof typeof FEATURE_WEIGHTS>)
    .map((key) => differenceFor(key, profile[key], baseline.profile[key]))
    .filter((difference): difference is ToneDifference => difference !== null)
    .sort((left, right) => right.weight - left.weight);

  const numericKeys = (Object.keys(FEATURE_WEIGHTS) as Array<keyof typeof FEATURE_WEIGHTS>)
    .filter((key): key is keyof Omit<ToneProfile, "opening"> => key !== "opening");
  const weightedDifference = numericKeys.reduce(
    (total, key) => total + normalizedDifference(key, profile[key], baseline.profile[key]) * FEATURE_WEIGHTS[key],
    profile.opening === baseline.profile.opening ? 0 : FEATURE_WEIGHTS.opening
  );
  const score = clamp(100 - weightedDifference / TOTAL_WEIGHT * 100);
  const status: ToneAlignmentStatus = baseline.confidence === "low"
    ? "watch"
    : score < ADVISORY_SCORE
      ? "drift"
      : score < WATCH_SCORE
        ? "watch"
        : "aligned";
  const topDifferences = differences.slice(0, 2);
  const directionEn = topDifferences.length > 0
    ? `Align with your reference voice: ${topDifferences.map((difference) => difference.suggestionEn).join(" ")}`
    : null;
  const directionZh = topDifferences.length > 0
    ? `向参考语气靠拢：${topDifferences.map((difference) => difference.suggestionZh).join("")}`
    : null;

  return {
    status,
    score,
    confidence: baseline.confidence,
    baseline,
    differences: topDifferences,
    directionEn,
    directionZh
  };
}

export const TONE_ALIGNMENT_THRESHOLDS = { advisory: ADVISORY_SCORE, watch: WATCH_SCORE } as const;