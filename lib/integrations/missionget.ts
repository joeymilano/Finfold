import { z } from "zod";
import { brandBrainSchema } from "@/lib/brand-brain";
import { generateRequestSchema, type GenerateRequest, type KitOutput } from "@/lib/content-schema";
import { getLocalizedPlatformLabel, type PlatformId } from "@/lib/platforms";
import type { GoalId } from "@/lib/goals";
import type { PersonaId } from "@/lib/personas";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_INPUT_CHARS = 8_000;
const MAX_OUTPUT_CHARS = 24_000;

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string()
}).passthrough();

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([
    z.string(),
    z.array(textPartSchema).max(32)
  ])
}).passthrough();

export const missionGetChatRequestSchema = z.object({
  model: z.string().max(200).optional(),
  messages: z.array(messageSchema).min(1).max(24),
  stream: z.boolean().optional().default(false),
  id: z.union([z.string(), z.number()]).optional(),
  request_id: z.union([z.string(), z.number()]).optional(),
  user: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).passthrough();

export type MissionGetChatRequest = z.infer<typeof missionGetChatRequestSchema>;

type CachedCompletion = {
  expiresAt: number;
  value: MissionGetChatCompletion;
};

const globalRef = globalThis as typeof globalThis & {
  __finfoldMissionGetCompletions?: Map<string, CachedCompletion>;
};

const completionCache = globalRef.__finfoldMissionGetCompletions
  ?? (globalRef.__finfoldMissionGetCompletions = new Map());

const PLATFORM_ALIASES: Array<{ id: PlatformId; patterns: RegExp[] }> = [
  { id: "xiaohongshu", patterns: [/小红书/iu, /\b(?:rednote|red)\b/iu] },
  { id: "zhihu", patterns: [/知乎/iu, /\bzhihu\b/iu] },
  { id: "wechat", patterns: [/微信公众号|公众号/iu, /\bwechat\s*(?:official|article|account)/iu] },
  { id: "moments", patterns: [/朋友圈/iu, /\bwechat\s*moments?\b/iu] },
  { id: "linkedin", patterns: [/领英/iu, /\blinkedin\b/iu] },
  { id: "x", patterns: [/推特/iu, /\btwitter\b/iu, /(?:^|[\s,，、/])x(?=$|[\s,，、/.])/iu] },
  { id: "instagram", patterns: [/\b(?:instagram|ig)\b/iu] },
  { id: "facebook", patterns: [/\b(?:facebook|fb)\b/iu] },
  { id: "reddit", patterns: [/\breddit\b/iu] },
  { id: "product-hunt", patterns: [/\bproduct\s*hunt\b/iu, /\bph\b/iu] },
  { id: "threads", patterns: [/\bthreads\b/iu] },
  { id: "hacker-news", patterns: [/\bhacker\s*news\b/iu, /\bhn\b/u] },
  { id: "indie-hackers", patterns: [/\bindie\s*hackers?\b/iu] },
  { id: "medium-substack", patterns: [/\b(?:medium|substack|newsletter)\b/iu, /邮件通讯|电子报/iu] }
];

export type MissionGetChatCompletion = {
  id: string;
  object: "chat.completion";
  created: number;
  model: "finfold-missionget-v1";
  choices: Array<{
    index: 0;
    message: { role: "assistant"; content: string };
    finish_reason: "stop";
  }>;
};

export async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new MissionGetRequestError(413, "Request body exceeds 64 KB.", "request_too_large");
  }

  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new MissionGetRequestError(413, "Request body exceeds 64 KB.", "request_too_large");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function verifyMissionGetSignature(
  rawBody: Uint8Array,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  const supplied = decodeSignature(signatureHeader);
  if (!supplied || supplied.byteLength !== 32) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, Uint8Array.from(rawBody).buffer)
  );
  let mismatch = 0;
  for (let index = 0; index < expected.byteLength; index += 1) {
    mismatch |= expected[index] ^ supplied[index];
  }
  return mismatch === 0;
}

export function parseMissionGetRequest(rawBody: Uint8Array): MissionGetChatRequest {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    throw new MissionGetRequestError(400, "Request body must be valid JSON.", "invalid_json");
  }

  const parsed = missionGetChatRequestSchema.safeParse(value);
  if (!parsed.success) {
    throw new MissionGetRequestError(400, "Invalid OpenAI chat-completions request.", "invalid_request");
  }
  if (parsed.data.stream) {
    throw new MissionGetRequestError(400, "Streaming is not supported by this webhook.", "stream_not_supported");
  }
  return parsed.data;
}

export function missionGetRequestToGenerateInput(payload: MissionGetChatRequest): GenerateRequest {
  const ideaText = payload.messages
    .filter((message) => message.role === "user")
    .map((message) => messageContent(message.content))
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (ideaText.length < 20) {
    throw new MissionGetRequestError(400, "Please provide at least 20 characters of user context.", "brief_too_short");
  }
  if (ideaText.length > MAX_INPUT_CHARS) {
    throw new MissionGetRequestError(400, "User content exceeds 8,000 characters.", "brief_too_long");
  }

  const language = inferLanguage(ideaText);
  const input = {
    ideaText,
    goal: inferGoal(ideaText),
    persona: inferPersona(ideaText),
    platforms: inferPlatforms(ideaText, language),
    mediaAssets: [],
    language,
    brandBrain: brandBrainSchema.parse({}),
    customRules: [
      "Do not invent facts, customer quotes, metrics, prices, or product capabilities that are not present in the user's brief.",
      "This is a stateless partner request. Return drafts only; do not claim that content was saved or published."
    ]
  };
  return generateRequestSchema.parse(input);
}

export function inferPlatforms(
  text: string,
  language: "zh" | "en" | "bilingual"
): PlatformId[] {
  const explicit = PLATFORM_ALIASES
    .filter(({ patterns }) => patterns.some((pattern) => pattern.test(text)))
    .map(({ id }) => id);
  if (explicit.length > 0) return [...new Set(explicit)].slice(0, 4);
  if (language === "zh") return ["xiaohongshu", "wechat"];
  if (language === "bilingual") return ["xiaohongshu", "wechat", "linkedin", "x"];
  return ["linkedin", "x"];
}

export function inferLanguage(text: string): "zh" | "en" | "bilingual" {
  if (/双语|中英(?:文)?|bilingual/iu.test(text)) return "bilingual";
  return /[\u3400-\u9fff]/u.test(text) ? "zh" : "en";
}

export function formatMissionGetOutputs(
  outputs: KitOutput[],
  language: GenerateRequest["language"]
): string {
  const locale = language === "en" ? "en" : "zh";
  const sections = outputs.map((output) => {
    const label = getLocalizedPlatformLabel(output.platform, locale);
    const fields = locale === "zh"
      ? { title: "标题", body: "正文", cta: "行动引导", strategy: "策略", notes: "备注" }
      : { title: "Title", body: "Copy", cta: "CTA", strategy: "Strategy", notes: "Notes" };
    return [
      `## ${label}`,
      `**${fields.title}**\n${output.title}`,
      `**${fields.body}**\n${output.body}`,
      `**${fields.cta}**\n${output.cta}`,
      `**${fields.strategy}**\n${output.strategy}`,
      `**${fields.notes}**\n${output.notes}`
    ].join("\n\n");
  });
  const prefix = locale === "zh"
    ? "以下是按平台原生语感生成的内容草稿（未保存、未发布）："
    : "Here are platform-native content drafts (not saved or published):";
  return `${prefix}\n\n${sections.join("\n\n---\n\n")}`.slice(0, MAX_OUTPUT_CHARS);
}

export function createMissionGetCompletion(content: string): MissionGetChatCompletion {
  return {
    id: `chatcmpl_${crypto.randomUUID().replaceAll("-", "")}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1_000),
    model: "finfold-missionget-v1",
    choices: [{
      index: 0,
      message: { role: "assistant", content },
      finish_reason: "stop"
    }]
  };
}

export async function missionGetOperationKey(
  request: Request,
  payload: MissionGetChatRequest,
  rawBody: Uint8Array
): Promise<{ operationKey: string; inputFingerprint: string; partnerRequestId: string | null }> {
  const partnerRequestId = firstNonEmptyString(
    request.headers.get("x-missionget-request-id"),
    request.headers.get("x-request-id"),
    payload.request_id,
    payload.id,
    payload.metadata?.invocation_id,
    payload.metadata?.request_id
  );
  const inputFingerprint = await sha256Hex(rawBody);
  const identity = partnerRequestId
    ? await sha256Hex(new TextEncoder().encode(partnerRequestId))
    : crypto.randomUUID().replaceAll("-", "");
  return {
    operationKey: `missionget-generation:${identity}`,
    inputFingerprint,
    partnerRequestId
  };
}

export function getCachedMissionGetCompletion(operationKey: string): MissionGetChatCompletion | null {
  const cached = completionCache.get(operationKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    completionCache.delete(operationKey);
    return null;
  }
  return cached.value;
}

export function cacheMissionGetCompletion(operationKey: string, value: MissionGetChatCompletion): void {
  if (completionCache.size > 200) {
    const now = Date.now();
    for (const [key, cached] of completionCache) {
      if (cached.expiresAt <= now) completionCache.delete(key);
    }
  }
  completionCache.set(operationKey, { value, expiresAt: Date.now() + 10 * 60_000 });
}

export class MissionGetRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "MissionGetRequestError";
  }
}

function messageContent(content: z.infer<typeof messageSchema>["content"]): string {
  return typeof content === "string"
    ? content
    : content.map((part) => part.text).join("\n");
}

function inferGoal(text: string): GoalId {
  if (/活动|报名|峰会|讲座|workshop|webinar|conference|event\b/iu.test(text)) return "event-promo";
  if (/获客|线索|销售|预约|咨询|leads?|sales?|book\s+a\s+call/iu.test(text)) return "lead-gen";
  if (/涨粉|关注|粉丝|受众|followers?|audience/iu.test(text)) return "audience-growth";
  return "product-launch";
}

function inferPersona(text: string): PersonaId {
  if (/设计|design(?:er| studio| service)?/iu.test(text)) return "design-service";
  if (/咨询|顾问|consult(?:ant|ing)/iu.test(text)) return "consultant";
  if (/出海|全球|海外|global\s+(?:team|market)/iu.test(text)) return "global-team";
  if (/\bai\b|人工智能|智能体|agent|saas/iu.test(text)) return "ai-saas";
  return "indie-builder";
}

function decodeSignature(header: string | null): Uint8Array | null {
  const value = header?.trim().replace(/^sha256=/iu, "");
  if (!value) return null;
  if (/^[0-9a-f]{64}$/iu.test(value)) {
    return Uint8Array.from(value.match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16));
  }
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer)
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) {
      return String(value).trim().slice(0, 200);
    }
  }
  return null;
}
