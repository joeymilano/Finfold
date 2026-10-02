/**
 * Input content moderation — edge-compatible, no external API required.
 *
 * Uses keyword-based heuristics to catch obviously violating content.
 * This is a first-pass guard; the LLM itself will also refuse to produce
 * harmful output, providing a second layer.
 */

type ModerationResult =
  | { flagged: false }
  | { flagged: true; category: "sexual" | "violence" | "hate"; reason: string };

// Patterns for each category (case-insensitive)
const SEXUAL_PATTERNS = [
  /好想跟.{0,6}(做|上|睡|操|干)/u,
  /色情|淫秽|av片|pornograph|explicit sex/iu,
  /脱衣|裸体|裸露|nude|naked/iu,
  /性爱|性交|做爱|交配|交欢/u,
];

const VIOLENCE_PATTERNS = [
  /杀人|谋杀|自杀|murder|kill yourself/iu,
  /炸弹|爆炸|bomb|terrorism|terrorist/iu,
  /射击教学|如何制造武器|how to make.*weapon/iu,
];

const HATE_PATTERNS = [
  /种族歧视|歧视.*人种|racist/iu,
  /仇恨.*群体|hate speech/iu,
];

export function moderateInput(text: string): ModerationResult {
  const normalised = text.replace(/\s+/g, " ").trim();

  for (const pattern of SEXUAL_PATTERNS) {
    if (pattern.test(normalised)) {
      return {
        flagged: true,
        category: "sexual",
        reason: "输入内容包含不适当的性相关文字，请修改后重试。(Input contains inappropriate sexual content.)"
      };
    }
  }

  for (const pattern of VIOLENCE_PATTERNS) {
    if (pattern.test(normalised)) {
      return {
        flagged: true,
        category: "violence",
        reason: "输入内容包含暴力或危险信息，请修改后重试。(Input contains violent or dangerous content.)"
      };
    }
  }

  for (const pattern of HATE_PATTERNS) {
    if (pattern.test(normalised)) {
      return {
        flagged: true,
        category: "hate",
        reason: "输入内容包含仇恨言论，请修改后重试。(Input contains hate speech.)"
      };
    }
  }

  return { flagged: false };
}
