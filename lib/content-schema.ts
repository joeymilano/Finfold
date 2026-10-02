import { z } from "zod";
import { generationAnalyticsSchema } from "@/lib/generation-analytics-context";
import { brandBrainSchema } from "@/lib/brand-brain";
import { growthGoals } from "@/lib/goals";
import { personas } from "@/lib/personas";
import { MAX_PLATFORMS_PER_GENERATION, platforms } from "@/lib/platforms";
import { industryPackIdSchema } from "@/lib/industry-rules/types";
import { researchGenerationContextSchema } from "@/lib/operations/research";
import type { GoalId } from "@/lib/goals";
import type { PersonaId } from "@/lib/personas";
import type { PlatformId } from "@/lib/platforms";
import {
  outputImageSourceSchema,
  sourceImageAssetSchema
} from "@/lib/source-image";

const platformIds = platforms.map((platform) => platform.id) as [PlatformId, ...PlatformId[]];
const goalIds = growthGoals.map((goal) => goal.id) as [GoalId, ...GoalId[]];
const personaIds = personas.map((persona) => persona.id) as [PersonaId, ...PersonaId[]];

export const platformIdSchema = z.enum(platformIds);
export const goalIdSchema = z.enum(goalIds);
export const personaIdSchema = z.enum(personaIds);
export const kitStatusSchema = z.enum(["preview", "saved", "published", "analyzed"]);
export const publishStatusSchema = z.enum(["draft", "planned", "posted", "measured", "iterated"]);
export const growthMissionIdSchema = z.string().uuid();
export const researchMissionIdSchema = z.string().uuid();
export const xhsWorkflowIdSchema = z.string().uuid();
export const agentContentWorkflowIdSchema = z.string().uuid();
export const topicOpportunityIdSchema = z.string().uuid();

export const mediaAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["image", "video"]),
  size: z.number().nonnegative(),
  url: z.string().optional(),
  /** Local, best-effort visual checks. QR payloads are never persisted. */
  compliance: z.object({
    qrCode: z.enum(["detected", "not-detected", "unavailable"])
  }).optional()
});

/** Private source files uploaded through the shared Agent attachment route.
 * The server re-checks tenant ownership and reads the stored bytes; browser
 * metadata alone is never treated as file contents. */
export const sourceAttachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(180),
  size: z.number().int().nonnegative().max(25 * 1024 * 1024),
  kind: z.enum(["image", "video", "pdf", "document", "data"]),
  mimeType: z.string().min(1).max(120),
  storagePath: z.string().min(1).max(300)
});

export const perfExampleSchema = z.object({
  title: z.string(),
  body: z.string(),
  likes: z.number().nonnegative(),
  comments: z.number().nonnegative(),
  impressions: z.number().nonnegative().optional(),
  views: z.number().nonnegative().optional(),
  coverClickRate: z.number().nonnegative().max(100).optional(),
  averageViewSeconds: z.number().nonnegative().optional(),
  saves: z.number().nonnegative().optional(),
  shares: z.number().nonnegative().optional(),
  followerGrowth: z.number().optional()
});

export const generateRequestSchema = z.object({
  // Telemetry only; never used for billing, model selection, or authorization.
  analytics: generationAnalyticsSchema.optional(),
  ideaText: z.string().max(12_000).default(""),
  goal: goalIdSchema,
  persona: personaIdSchema,
  platforms: z.array(platformIdSchema).min(1).max(MAX_PLATFORMS_PER_GENERATION),
  sourceAttachments: z.array(sourceAttachmentSchema).max(6).optional(),
  growthMissionId: growthMissionIdSchema.optional(),
  /** Client identifies the approved Research mission; its decision and
   * evidence are always reloaded and ownership-checked by /api/generate. */
  researchMissionId: researchMissionIdSchema.optional(),
  xhsWorkflowId: xhsWorkflowIdSchema.optional(),
  /** Server-validated reference to a confirmed WeChat or X Agent workflow. */
  agentContentWorkflowId: agentContentWorkflowIdSchema.optional(),
  /** Server ownership-checked attribution from Opportunity Radar. */
  sourceTopicOpportunityId: topicOpportunityIdSchema.optional(),
  artifactVersionIds: z.array(z.string().uuid()).max(12).optional(),
  mediaAssets: z.array(mediaAssetSchema).default([]),
  language: z.enum(["auto", "zh", "en", "bilingual"]).default("auto"),
  customRules: z.array(z.string()).optional(),
  brandBrain: brandBrainSchema.optional(),
  /** When true, also generate one AI cover image per platform output. Image
   * credits are billed SEPARATELY from content (ACTION_CREDITS.standardImage ×
   * platform count), each with its own reserve/settle/refund — see route.
   * Optional so existing callers that build a GenerateRequest are unaffected;
   * the route treats undefined as "off". */
  withImage: z.boolean().optional(),
  /** Workbench visual policy. Omitted by legacy API/MCP callers so they keep
   * their existing no-network behavior. */
  visualMode: z.enum(["source_first", "none", "ai_generate"]).optional(),
  /** Selected, already-cached source image. It remains separate from
   * mediaAssets so it cannot switch copy generation onto a vision model. */
  visualSource: sourceImageAssetSchema.optional(),
  /** Server-populated only (never sent by the client) — this user's own
   * highest-performing past posts per platform, injected as few-shot
   * examples. See lib/performance-examples.ts. */
  perfExamples: z.record(z.string(), z.array(perfExampleSchema)).optional(),
  /** Server-populated only (never trusted from the client) — resolved from
   * custom_guardrails.enabled_packs at generation time, same pattern as
   * perfExamples. See lib/industry-rules/. */
  industryPackIds: z.array(industryPackIdSchema).optional(),
  /** Server-populated from an accepted Growth Mission. It gives generation a
   * single measurable job instead of letting the model optimize every signal
   * at once. Client-provided values are overwritten in the route. */
  experimentContext: z.object({
    platform: platformIdSchema,
    hypothesis: z.string().min(1),
    primaryMetric: z.string().min(1),
    primaryMetricKey: z.enum([
      "impressions",
      "cover_click_rate",
      "average_view_seconds",
      "save_share_per_thousand",
      "followers_per_thousand",
      "leads",
      "signups",
      "revenue"
    ]),
    baselineValue: z.number(),
    targetValue: z.number(),
    variants: z.array(z.object({
      name: z.string(),
      angle: z.string(),
      hookInstruction: z.string(),
      format: z.string()
    })).default([])
  }).optional(),
  /** Server-populated only. Client-provided values are discarded before a
   * queued or foreground generation is claimed. */
  intelligenceContext: researchGenerationContextSchema.optional(),
  /** Server-populated from approved, user-owned workflow artifacts. The
   * client may identify artifact ids, but their payload is always reloaded
   * and ownership-checked by /api/generate. */
  xhsWorkflowContext: z.object({
    workflowId: xhsWorkflowIdSchema,
    stage: z.enum(["positioning", "topic", "draft", "title", "visual", "publish", "review"]),
    positioning: z.string().optional(),
    selectedTopic: z.string().optional(),
    noteBrief: z.record(z.string(), z.unknown()).optional(),
    selectedTitle: z.string().optional(),
    visualPlan: z.record(z.string(), z.unknown()).optional(),
    artifactVersionIds: z.array(z.string().uuid()).default([])
  }).optional()
}).superRefine((input, ctx) => {
  if (input.visualSource && input.visualMode !== "source_first") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["visualSource"],
      message: "A visual source can only be used in source-first mode."
    });
  }
  if (input.ideaText.trim().length >= 20 || (input.sourceAttachments?.length ?? 0) > 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.too_small,
    minimum: 20,
    inclusive: true,
    type: "string",
    path: ["ideaText"],
    message: "Add at least 20 characters of context or attach a source file."
  });
});

export const visualAssetSchema = z.object({
  id: z.string().optional(),
  assetType: z.literal("article_illustration"),
  positionIndex: z.number().int().min(0).max(11),
  role: z.enum(["concept", "process", "comparison", "evidence"]),
  sourceExcerpt: z.string(),
  placementHint: z.string(),
  prompt: z.string(),
  imageUrl: z.string().url(),
  altText: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  revision: z.number().int().positive().optional(),
  isCurrent: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export const kitOutputSchema = z.object({
  /** Server-generated row id (migration 015) — undefined for in-memory/trial
   * outputs that were never persisted, since those can't be edited via PUT. */
  id: z.string().optional(),
  platform: platformIdSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  /** Platform-ready excerpt. WeChat uses this as the draft digest; older
   * outputs may omit it and derive a conservative first-paragraph fallback. */
  summary: z.string().max(240).optional(),
  cta: z.string().min(1),
  notes: z.string().min(1),
  strategy: z.string().min(1),
  locked: z.boolean().default(false),
  publishStatus: publishStatusSchema.default("draft"),
  /** AI-generated cover image URL for this platform output */
  imageUrl: z.string().url().optional().or(z.literal("")),
  /** The prompt used to generate the cover image */
  imagePrompt: z.string().optional(),
  /** Provenance and render state for imageUrl. */
  imageSource: outputImageSourceSchema.optional(),
  /** User-edited body, if the user has ever saved an edit. Falls back to
   * `body` (the original AI draft) when absent. */
  finalBody: z.string().optional(),
  userEdited: z.boolean().default(false),
  publishedUrl: z.string().url().optional().or(z.literal("")),
  publishedAt: z.string().optional(),
  /** Durable revision used to bind an explicit publication approval. */
  updatedAt: z.string().optional(),
  visualAssets: z.array(visualAssetSchema).optional()
});

export const contentKitSchema = z.object({
  id: z.string(),
  growthMissionId: growthMissionIdSchema.optional(),
  researchMissionId: researchMissionIdSchema.optional(),
  xhsWorkflowId: xhsWorkflowIdSchema.optional(),
  sourceTopicOpportunityId: topicOpportunityIdSchema.optional(),
  artifactVersionIds: z.array(z.string().uuid()).optional(),
  ideaText: z.string(),
  goal: goalIdSchema,
  persona: personaIdSchema,
  platforms: z.array(platformIdSchema),
  mediaAssets: z.array(mediaAssetSchema),
  visualSource: sourceImageAssetSchema.optional(),
  outputs: z.array(kitOutputSchema),
  status: kitStatusSchema.default("saved"),
  createdAt: z.string()
});

export const performanceSourceSchema = z.enum(["manual", "import", "auto"]);

export const performanceMetricsSchema = z.object({
  platform: platformIdSchema,
  impressions: z.number().int().nonnegative().default(0),
  /** Platform-native content views. Kept separate from link clicks so
   * Xiaohongshu's "观看数" is not collapsed into a website conversion. */
  views: z.number().int().nonnegative().default(0),
  clicks: z.number().int().nonnegative().default(0),
  /** Percentage as displayed by the platform, e.g. 5.6 means 5.6%. */
  coverClickRate: z.number().nonnegative().max(100).default(0),
  averageViewSeconds: z.number().nonnegative().default(0),
  likes: z.number().int().nonnegative().default(0),
  comments: z.number().int().nonnegative().default(0),
  saves: z.number().int().nonnegative().default(0),
  shares: z.number().int().nonnegative().default(0),
  followerGrowth: z.number().int().default(0),
  profileVisits: z.number().int().nonnegative().default(0),
  leads: z.number().int().nonnegative().default(0),
  signups: z.number().int().nonnegative().default(0),
  revenue: z.number().nonnegative().default(0),
  publishedUrl: z.string().url().optional().or(z.literal("")),
  measuredAt: z.string().optional(),
  source: performanceSourceSchema.default("manual")
});

export const performancePayloadSchema = z.object({
  kitId: z.string(),
  metrics: performanceMetricsSchema
});

export const performanceImportRequestSchema = z.object({
  kitId: z.string(),
  platform: platformIdSchema,
  pastedText: z.string().min(10).max(8000)
});

export const iterateRequestSchema = z.object({
  kitId: z.string(),
  ideaText: z.string(),
  outputs: z.array(kitOutputSchema),
  metrics: z.array(performanceMetricsSchema).default([]),
  language: z.enum(["zh", "en"]).default("zh")
});

export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type GenerateRequest = z.infer<typeof generateRequestSchema>;
export type KitOutput = z.infer<typeof kitOutputSchema>;
export type VisualAsset = z.infer<typeof visualAssetSchema>;
export type ContentKit = z.infer<typeof contentKitSchema>;
export type PerformanceMetrics = z.infer<typeof performanceMetricsSchema>;
export type PerformanceSource = z.infer<typeof performanceSourceSchema>;
export type PerformanceImportRequest = z.infer<typeof performanceImportRequestSchema>;
export type IterateRequest = z.infer<typeof iterateRequestSchema>;
export type IterationReport = {
  id: string;
  kitId: string;
  summary: string;
  wins: string[];
  problems: string[];
  nextActions: string[];
  createdAt: string;
};
