import { z } from "zod";
import type { KitOutput } from "@/lib/content-schema";
import { platformIdSchema } from "@/lib/content-schema";
import type { Locale } from "@/lib/i18n";
import type { PlatformId } from "@/lib/platforms";

export const visualStoryPageRoleSchema = z.enum(["cover", "insight", "list", "quote", "cta"]);
export type VisualStoryPageRole = z.infer<typeof visualStoryPageRoleSchema>;

export const visualStoryThemeSchema = z.enum(["editorial", "signal", "field-notes"]);
export type VisualStoryTheme = z.infer<typeof visualStoryThemeSchema>;

export const visualStoryStrategySchema = z.enum(["story-driven", "information-dense", "visual-first"]);
export type VisualStoryStrategy = z.infer<typeof visualStoryStrategySchema>;

export const visualStoryPageSchema = z.object({
  id: z.string().min(1),
  role: visualStoryPageRoleSchema,
  kicker: z.string().max(32).default(""),
  title: z.string().min(1).max(90),
  body: z.string().max(320).default(""),
  points: z.array(z.string().min(1).max(90)).max(5).default([]),
  emphasis: z.string().max(48).default("")
});

export type VisualStoryPage = z.infer<typeof visualStoryPageSchema>;

export const visualStorySchema = z.object({
  title: z.string().min(1).max(100),
  artDirection: z.string().max(300).default(""),
  theme: visualStoryThemeSchema.default("editorial"),
  strategy: visualStoryStrategySchema.default("information-dense"),
  pages: z.array(visualStoryPageSchema).min(3).max(9)
});

export type VisualStory = z.infer<typeof visualStorySchema>;

export const visualStoryRequestSchema = z.object({
  platform: platformIdSchema,
  locale: z.enum(["zh", "en"]),
  title: z.string().min(1).max(240),
  body: z.string().min(20).max(8000),
  cta: z.string().min(1).max(500),
  pageCount: z.number().int().min(4).max(9),
  theme: visualStoryThemeSchema.optional(),
  strategy: visualStoryStrategySchema.optional(),
  primaryMetric: z.string().max(120).optional()
});

export type VisualStoryRequest = z.infer<typeof visualStoryRequestSchema>;

export const visualStoryThemes: Record<VisualStoryTheme, {
  labelZh: string;
  labelEn: string;
  paper: string;
  ink: string;
  muted: string;
  accent: string;
  soft: string;
}> = {
  editorial: {
    labelZh: "编辑部",
    labelEn: "Editorial",
    paper: "#f3efe3",
    ink: "#171714",
    muted: "#6f6b60",
    accent: "#f05a2a",
    soft: "#ddd5c2"
  },
  signal: {
    labelZh: "高信号",
    labelEn: "Signal",
    paper: "#0b1020",
    ink: "#f5f7ff",
    muted: "#a8b0c8",
    accent: "#53e6c2",
    soft: "#17223c"
  },
  "field-notes": {
    labelZh: "田野笔记",
    labelEn: "Field notes",
    paper: "#f2d95c",
    ink: "#172554",
    muted: "#5b6178",
    accent: "#3157d5",
    soft: "#e7c947"
  }
};

export function buildVisualStoryPrompt(input: VisualStoryRequest): string {
  const isZh = input.locale === "zh";
  const languageRule = isZh
    ? "所有可见文案必须使用简体中文。标题尽量不超过 22 个汉字，正文每页不超过 90 个汉字。"
    : "All visible copy must be in English. Keep titles under 10 words and body copy under 35 words per page.";

  const strategyRule = input.strategy
    ? strategyPromptRule(input.strategy)
    : "Choose the strongest of these strategies from the source: story-driven, information-dense, or visual-first.";

  return `You are a senior social editorial designer. Turn the supplied ${input.platform} post into a coherent ${input.pageCount}-page visual story, not a set of disconnected quote cards.

Source title:
${input.title}

Source body:
${input.body}

Source CTA:
${input.cta}

Rules:
1. Return exactly ${input.pageCount} pages. Page 1 role must be "cover" and the final page role must be "cta".
2. Build a narrative arc: hook -> context -> useful proof/steps -> memorable conclusion -> CTA.
3. Use only claims, facts, numbers, examples, and promises present in the source. Never invent statistics, customers, results, testimonials, or product capabilities.
4. Each page must add new information. Do not repeat the cover headline across body pages.
5. Use role "list" only when there are 2-5 genuinely parallel points. Use "quote" for one short, memorable statement. Otherwise use "insight".
6. "kicker" is a short navigation label. "emphasis" is one short phrase that deserves visual emphasis.
7. ${languageRule}
8. ${input.theme
    ? `Use the preselected theme "${input.theme}" because it matches the platform and source material.`
    : "Choose one theme: \"editorial\", \"signal\", or \"field-notes\"."}
9. Strategy: ${strategyRule}
10. ${input.primaryMetric
    ? `This package is designed to improve "${input.primaryMetric}". Let that metric change the information order, but do not invent performance claims.`
    : "Optimize for useful attention: a clear click promise, fast payoff, save-worthy value, and a durable next action."}
Write one concise artDirection describing the consistent visual rhythm across all pages.

Return JSON only:
{
  "title": "story name",
  "theme": "editorial",
  "strategy": "${input.strategy ?? "information-dense"}",
  "artDirection": "one consistent visual direction",
  "pages": [
    {"role":"cover","kicker":"","title":"","body":"","points":[],"emphasis":""}
  ]
}`;
}

export function parseVisualStoryResponse(raw: string, expectedPageCount?: number): VisualStory {
  const json = extractFirstJsonObject(raw);
  if (!json) throw new Error("AI did not return a visual story.");

  const parsed = JSON.parse(json) as {
    title?: unknown;
    theme?: unknown;
    strategy?: unknown;
    artDirection?: unknown;
    pages?: Array<Record<string, unknown>>;
  };

  const allPages = Array.isArray(parsed.pages) ? parsed.pages : [];
  if (allPages.length === 0) throw new Error("AI did not return any visual-story pages.");
  // Tolerate page-count drift instead of discarding the whole response —
  // a 144s paid call (two 60s provider timeouts on failover) must not be
  // thrown away over an off-by-one. Excess pages are truncated to the
  // requested count (capped at the schema's max of 9); a response with
  // fewer pages than requested is still accepted as long as it clears the
  // schema's floor of 3 pages, which is a real failure worth surfacing.
  const pages =
    expectedPageCount && allPages.length > expectedPageCount
      ? allPages.slice(0, expectedPageCount)
      : allPages.length > 9
        ? allPages.slice(0, 9)
        : allPages;

  const normalized = {
    title: parsed.title,
    theme: parsed.theme,
    strategy: parsed.strategy,
    artDirection: parsed.artDirection,
    pages: pages.map((page, index) => ({
      id: `page-${index + 1}-${crypto.randomUUID()}`,
      role: index === 0 ? "cover" : index === pages.length - 1 ? "cta" : page.role,
      kicker: typeof page.kicker === "string" ? page.kicker : "",
      title: page.title,
      body: typeof page.body === "string" ? page.body : "",
      points: Array.isArray(page.points) ? page.points : [],
      emphasis: typeof page.emphasis === "string" ? page.emphasis : ""
    }))
  };

  return visualStorySchema.parse(normalized);
}

export function buildLocalVisualStory(
  output: Pick<KitOutput, "title" | "body" | "finalBody" | "cta">,
  platform: PlatformId,
  locale: Locale,
  requestedPages = 5,
  preferredTheme?: VisualStoryTheme,
  preferredStrategy: VisualStoryStrategy = "information-dense"
): VisualStory {
  const body = (output.finalBody || output.body).trim();
  const segments = splitSourceIntoSegments(body);
  if (segments.length === 0) segments.push(body || output.title);
  const innerCount = Math.max(1, Math.min(requestedPages - 2, segments.length));
  const innerPages = segments.slice(0, innerCount).map((segment, index): VisualStoryPage => {
    const parts = segment.split(/[。！？!?]\s*/).filter(Boolean);
    const title = trimVisible(parts[0] || segment, locale === "zh" ? 34 : 80);
    const rest = parts.slice(1).join(locale === "zh" ? "。" : ". ");
    const bulletPoints = segment
      .split(/(?:^|\n)\s*(?:[-*•]|\d+[.)、])\s*/)
      .map((item) => item.trim())
      .filter((item) => item && item !== segment)
      .slice(0, 5);

    return {
      id: `local-${index + 2}-${crypto.randomUUID()}`,
      role: bulletPoints.length >= 2 ? "list" : index % 3 === 2 ? "quote" : "insight",
      kicker: locale === "zh" ? `第 ${index + 1} 个重点` : `Point ${index + 1}`,
      title,
      body: trimVisible(rest || segment, locale === "zh" ? 180 : 260),
      points: bulletPoints,
      emphasis: ""
    };
  });

  return visualStorySchema.parse({
    title: output.title,
    theme: preferredTheme ?? (platform === "xiaohongshu" || platform === "instagram" ? "editorial" : "signal"),
    strategy: preferredStrategy,
    artDirection: locale === "zh" ? "从封面钩子到可收藏重点，再用明确行动收束。" : "Move from a strong hook to save-worthy points, then close with one action.",
    pages: [
      {
        id: `local-cover-${crypto.randomUUID()}`,
        role: "cover",
        kicker: locale === "zh" ? "图文内容" : "Visual story",
        title: trimVisible(output.title, locale === "zh" ? 48 : 90),
        body: "",
        points: [],
        emphasis: ""
      },
      ...innerPages,
      {
        id: `local-cta-${crypto.randomUUID()}`,
        role: "cta",
        kicker: locale === "zh" ? "下一步" : "Next step",
        title: trimVisible(output.cta, locale === "zh" ? 52 : 90),
        body: "",
        points: [],
        emphasis: locale === "zh" ? "保存 · 分享 · 行动" : "Save · Share · Act"
      }
    ]
  });
}

function strategyPromptRule(strategy: VisualStoryStrategy): string {
  if (strategy === "story-driven") {
    return "Use a lived situation as the thread: tension -> discovery -> proof -> lesson -> action. Keep it specific and emotionally credible.";
  }
  if (strategy === "visual-first") {
    return "Use minimal copy and maximum visual contrast. The cover and every page should communicate one idea within three seconds.";
  }
  return "Lead with the conclusion, then deliver a checklist, comparison, process, or reusable framework. Prioritize saves and shares.";
}

function splitSourceIntoSegments(source: string): string[] {
  const cleaned = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const paragraphs = cleaned.split(/\n\s*\n/).map((item) => item.trim()).filter((item) => item.length >= 12);
  if (paragraphs.length >= 2) return paragraphs;

  return cleaned
    .split(/(?<=[。！？!?])\s*/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8);
}

function trimVisible(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return Array.from(normalized).length > max ? `${Array.from(normalized).slice(0, max).join("")}…` : normalized;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}
