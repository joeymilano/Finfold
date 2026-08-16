/**
 * password-policy.ts
 * ----------------------------------------------------------------------------
 * 密码策略 —— 前后端共享的「单一事实来源」。
 *
 *   前端：analyzePassword() 驱动强度条 + 规则清单 + 提交前校验
 *   后端：analyzePassword() 作为防绕过的硬性兜底（/api/auth/signup、/password）
 *
 * 策略（平衡安全与体验，参考 NIST 800-63B / OWASP Auth）：
 *   - 硬门槛（必须满足才允许注册）：长度 ≥ 8 + 含字母 + 含数字 + 非常见弱密码
 *   - 推荐项（仅展示、引导）：含符号
 *   - 强度评分（仅展示、非门槛）：基于「长度 × 字符多样性」
 *
 * 兼容 edge runtime：纯函数 + 正则 + 模块级 Set，无外部依赖。
 * ----------------------------------------------------------------------------
 */

export const PASSWORD_MIN_LENGTH = 8;

/** 常见弱密码黑名单（小写比对）——注册 / 改密直接拒绝 */
const WEAK_PASSWORDS: ReadonlySet<string> = new Set([
  "password", "password1", "password12", "password123",
  "passw0rd", "passw0rd1", "passwd123",
  "12345678", "123456789", "1234567890", "1234567abc",
  "11111111", "00000000", "22222222", "33333333", "66666666", "88888888",
  "abc12345", "abcd1234", "abcdabcd", "abcdefgh",
  "qwerty123", "qwertyui", "1q2w3e4r", "qazwsx123",
  "iloveyou", "iloveyou1", "admin123", "administrator",
  "letmein1", "welcome1", "monkey123", "sunshine1",
  "football1", "baseball1", "dragon12", "master12",
  "aaaa0000", "0000aaaa", "aaa11111",
]);

export type PasswordCheckId = "length" | "letter" | "digit" | "notCommon" | "symbol";

export interface PasswordCheck {
  id: PasswordCheckId;
  /** 是否通过 */
  ok: boolean;
  /** 是否为硬门槛（未通过则禁止提交） */
  required: boolean;
  zh: string;
  en: string;
}

export type PasswordLevel = "empty" | "weak" | "fair" | "good" | "strong";

export interface PasswordResult {
  /** 是否满足全部硬门槛 —— 后端 / 提交的唯一判据 */
  valid: boolean;
  /** 强度评分 0–4（0 = 空，仅展示） */
  score: 0 | 1 | 2 | 3 | 4;
  /** 逐项检查（前端清单渲染） */
  checks: PasswordCheck[];
  /** 强度档位 */
  level: PasswordLevel;
  /** 第一个未通过的硬门槛提示（zh） */
  messageZh: string;
  /** 第一个未通过的硬门槛提示（en） */
  messageEn: string;
}

const LEVEL_ZH: Record<PasswordLevel, string> = {
  empty: "",
  weak: "弱",
  fair: "一般",
  good: "良好",
  strong: "强",
};

const LEVEL_EN: Record<PasswordLevel, string> = {
  empty: "",
  weak: "Weak",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
};

export function strengthLabelZh(level: PasswordLevel): string {
  return LEVEL_ZH[level];
}

export function strengthLabelEn(level: PasswordLevel): string {
  return LEVEL_EN[level];
}

/**
 * 分析密码强度与合规性。纯函数，前后端通用。
 */
export function analyzePassword(password: string): PasswordResult {
  const pwd = password ?? "";
  const hasLower = /[a-z]/.test(pwd);
  const hasUpper = /[A-Z]/.test(pwd);
  const hasLetter = hasLower || hasUpper;
  const hasDigit = /\d/.test(pwd);
  const hasSymbol = /[^A-Za-z0-9]/.test(pwd);
  const lengthOk = pwd.length >= PASSWORD_MIN_LENGTH;
  const isCommon = pwd.length > 0 && WEAK_PASSWORDS.has(pwd.toLowerCase());

  const checks: PasswordCheck[] = [
    { id: "length", ok: lengthOk, required: true, zh: `至少 ${PASSWORD_MIN_LENGTH} 位`, en: `At least ${PASSWORD_MIN_LENGTH} characters` },
    { id: "letter", ok: hasLetter, required: true, zh: "包含字母", en: "Contains a letter" },
    { id: "digit", ok: hasDigit, required: true, zh: "包含数字", en: "Contains a number" },
    { id: "notCommon", ok: !isCommon, required: true, zh: "非常见弱密码", en: "Not a common password" },
    { id: "symbol", ok: hasSymbol, required: false, zh: "包含符号（推荐）", en: "Symbol (recommended)" },
  ];

  const valid = checks.filter((c) => c.required).every((c) => c.ok);

  // 强度评分（展示用）：空=0；未达门槛=1(弱)；达到门槛后按长度×多样性递增
  let score: 0 | 1 | 2 | 3 | 4;
  if (pwd.length === 0) {
    score = 0;
  } else if (!valid) {
    score = 1;
  } else {
    const variety = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
    let s = 2; // 达到硬门槛至少 fair
    if (pwd.length >= 10) s++;
    if (pwd.length >= 14) s++;
    if (variety >= 3) s++;
    if (s > 4) s = 4;
    score = s as 0 | 1 | 2 | 3 | 4;
  }

  const level: PasswordLevel = (
    ["empty", "weak", "fair", "good", "strong"] as const
  )[score];

  // 第一个未通过的硬门槛 → 可操作提示
  const firstFailed = checks.find((c) => c.required && !c.ok);

  return {
    valid,
    score,
    checks,
    level,
    messageZh: firstFailed?.zh ?? "",
    messageEn: firstFailed?.en ?? "",
  };
}
