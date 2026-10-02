import { z } from "zod";

/**
 * Lead tool spec (获客搭子) — the single JSON document that fully
 * describes one owner-branded interactive self-assessment: questions,
 * banded results with action checklists, the owner's own consultation
 * entries, and brand chrome. The same zod schema validates LLM output
 * (server), editor saves (API), and editor drafts (client), so the
 * document can never drift between surfaces.
 *
 * Visitor-facing behaviour is deliberately deterministic: option
 * points are summed client-side and mapped onto contiguous score
 * bands — no model call ever runs per visit.
 */

export const LEAD_TOOL_ID_PATTERN = /^[a-z0-9_-]{1,32}$/;

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === "" || /^https?:\/\//i.test(value), {
    message: "链接必须以 http(s):// 开头，或留空待填。"
  });

export const leadToolEntrySchema = z.object({
  id: z.string().regex(LEAD_TOOL_ID_PATTERN),
  label: z.string().trim().min(2).max(40),
  url: httpUrl,
  hint: z.string().trim().max(120).optional().default("")
});

export const leadToolResultSchema = z.object({
  id: z.string().regex(LEAD_TOOL_ID_PATTERN),
  title: z.string().trim().min(2).max(80),
  summary: z.string().trim().min(8).max(500),
  checklist: z.array(z.string().trim().min(4).max(160)).min(2).max(6),
  /** Why this result for this score — shown to the visitor, so no fake stats. */
  basis: z.string().trim().min(6).max(240),
  min_score: z.number().int().min(0).max(60),
  max_score: z.number().int().min(0).max(60),
  entry: z.string().regex(LEAD_TOOL_ID_PATTERN)
});

export const leadToolQuestionSchema = z.object({
  id: z.string().regex(LEAD_TOOL_ID_PATTERN),
  text: z.string().trim().min(4).max(140),
  help: z.string().trim().max(160).optional().default(""),
  options: z
    .array(
      z.object({
        id: z.string().regex(LEAD_TOOL_ID_PATTERN),
        text: z.string().trim().min(1).max(80),
        points: z.number().int().min(0).max(10)
      })
    )
    .min(2)
    .max(5)
});

export const leadToolBrandSchema = z.object({
  name: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(80).optional().default(""),
  accent_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, { message: "主题色需为 #RRGGBB 格式。" })
    .default("#0f766e"),
  logo_url: httpUrl.optional().default(""),
  show_finfold_credit: z.boolean().default(true)
});

export const leadToolSpecSchema = z.object({
  title: z.string().trim().min(4).max(60),
  intro: z.string().trim().min(4).max(200),
  questions: z.array(leadToolQuestionSchema).min(3).max(7),
  results: z.array(leadToolResultSchema).min(2).max(6),
  entries: z.array(leadToolEntrySchema).min(1).max(4),
  brand: leadToolBrandSchema
});

export type LeadToolEntry = z.infer<typeof leadToolEntrySchema>;
export type LeadToolResult = z.infer<typeof leadToolResultSchema>;
export type LeadToolQuestion = z.infer<typeof leadToolQuestionSchema>;
export type LeadToolBrand = z.infer<typeof leadToolBrandSchema>;
export type LeadToolSpec = z.infer<typeof leadToolSpecSchema>;

/** Max total a visitor could score: best option points per question. */
export function maxPossibleScore(spec: LeadToolSpec): number {
  return spec.questions.reduce(
    (total, question) => total + Math.max(...question.options.map((option) => option.points)),
    0
  );
}

/**
 * Cross-field rules zod cannot express. Returns human-readable issues
 * (zh) — the editor surfaces them directly, and the API refuses
 * saves/publishes when non-empty.
 */
export function validateLeadToolSpec(spec: LeadToolSpec): string[] {
  const issues: string[] = [];
  const maxScore = maxPossibleScore(spec);

  const entryIds = new Set(spec.entries.map((entry) => entry.id));
  for (const result of spec.results) {
    if (!entryIds.has(result.entry)) {
      issues.push(`结果「${result.title}」引用了不存在的入口 ${result.entry}。`);
    }
    if (result.min_score > result.max_score) {
      issues.push(`结果「${result.title}」的分数下限大于上限。`);
    }
  }

  const questionIds = new Set(spec.questions.map((question) => question.id));
  if (questionIds.size !== spec.questions.length) {
    issues.push("存在重复的题目 ID。");
  }
  for (const question of spec.questions) {
    const optionIds = new Set(question.options.map((option) => option.id));
    if (optionIds.size !== question.options.length) {
      issues.push(`题目「${question.text.slice(0, 12)}」存在重复的选项 ID。`);
    }
  }
  const resultIds = new Set(spec.results.map((result) => result.id));
  if (resultIds.size !== spec.results.length) {
    issues.push("存在重复的结果 ID。");
  }
  if (entryIds.size !== spec.entries.length) {
    issues.push("存在重复的入口 ID。");
  }

  // Score bands must be contiguous, start at 0, and cover every score a
  // visitor can reach — otherwise resolveLeadToolResult can return null.
  const bands = [...spec.results].sort((a, b) => a.min_score - b.min_score);
  let cursor = 0;
  for (const band of bands) {
    if (band.min_score !== cursor) {
      issues.push(`结果「${band.title}」的分数区间应从 ${cursor} 分开始（当前 ${band.min_score}）。`);
    }
    cursor = band.max_score + 1;
  }
  if (bands.length && bands[bands.length - 1].max_score < maxScore) {
    issues.push(`分数区间最高只到 ${bands[bands.length - 1].max_score} 分，但访客最高可能得 ${maxScore} 分。`);
  }

  return issues;
}

/** Blocking checks before the tool goes live (stronger than draft saves). */
export function validateLeadToolSpecForPublish(spec: LeadToolSpec): string[] {
  const issues = validateLeadToolSpec(spec);
  for (const entry of spec.entries) {
    if (!entry.url) {
      issues.push(`入口「${entry.label}」还没有填写链接，发布前必须补上。`);
    }
  }
  return issues;
}

export type LeadToolAnswers = Record<string, string>;

/** Deterministic scoring: sum chosen option points, find covering band. */
export function resolveLeadToolResult(spec: LeadToolSpec, answers: LeadToolAnswers): LeadToolResult | null {
  let total = 0;
  for (const question of spec.questions) {
    const option = question.options.find((candidate) => candidate.id === answers[question.id]);
    if (option) {
      total += option.points;
    }
  }
  return spec.results.find((result) => total >= result.min_score && total <= result.max_score) ?? null;
}

/** Minimal valid scaffold for the blank-editor path — obviously placeholder. */
export function blankLeadToolSpec(): LeadToolSpec {
  return leadToolSpecSchema.parse({
    title: "给这个工具起个名字",
    intro: "一句话告诉来访者：这是什么、做完能得到什么。",
    questions: [
      {
        id: "q1",
        text: "第一题：问一个和购买决策有关的问题",
        help: "",
        options: [
          { id: "q1a", text: "选项一（得分高）", points: 2 },
          { id: "q1b", text: "选项二（得分低）", points: 0 }
        ]
      },
      {
        id: "q2",
        text: "第二题：接着往下问",
        help: "",
        options: [
          { id: "q2a", text: "选项一", points: 2 },
          { id: "q2b", text: "选项二", points: 0 }
        ]
      },
      {
        id: "q3",
        text: "第三题：最后一题",
        help: "",
        options: [
          { id: "q3a", text: "选项一", points: 2 },
          { id: "q3b", text: "选项二", points: 0 }
        ]
      }
    ],
    results: [
      {
        id: "r_high",
        title: "高分结果示例",
        summary: "描述这类来访者当前最该先解决的一件事，语气像当面给建议。",
        checklist: ["行动一：具体到今天就能做", "行动二：具体到今天就能做"],
        basis: "示例：多数题得分较高，说明……（这里要写清评分依据）",
        min_score: 4,
        max_score: 6,
        entry: "entry_main"
      },
      {
        id: "r_low",
        title: "低分结果示例",
        summary: "描述另一类来访者的情况和他们该先做的事。",
        checklist: ["先做这件事就够了", "然后再看第二件"],
        basis: "示例：多数题得分较低，说明……",
        min_score: 0,
        max_score: 3,
        entry: "entry_main"
      }
    ],
    entries: [
      {
        id: "entry_main",
        label: "预约一次诊断",
        url: "",
        hint: ""
      }
    ],
    brand: {
      name: "你的品牌名",
      tagline: "",
      accent_color: "#0f766e",
      logo_url: "",
      show_finfold_credit: true
    }
  });
}
