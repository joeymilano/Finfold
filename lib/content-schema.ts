import { z } from "zod";
import { brandBrainSchema } from "@/lib/brand-brain";
import { growthGoals } from "@/lib/goals";
import { personas } from "@/lib/personas";
import { platforms } from "@/lib/platforms";
import type { GoalId } from "@/lib/goals";
import type { PersonaId } from "@/lib/personas";
import type { PlatformId } from "@/lib/platforms";

const platformIds = platforms.map((platform) => platform.id) as [PlatformId, ...PlatformId[]];
const goalIds = growthGoals.map((goal) => goal.id) as [GoalId, ...GoalId[]];
const personaIds = personas.map((persona) => persona.id) as [PersonaId, ...PersonaId[]];

export const platformIdSchema = z.enum(platformIds);
export const goalIdSchema = z.enum(goalIds);
export const personaIdSchema = z.enum(personaIds);
export const kitStatusSchema = z.enum(["preview", "saved", "published", "analyzed"]);
export const publishStatusSchema = z.enum(["draft", "planned", "posted", "measured", "iterated"]);

export const mediaAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["image", "video"]),
  size: z.number().nonnegative(),
  url: z.string().optional()
});

export const generateRequestSchema = z.object({
  ideaText: z.string().min(20, "Add at least 20 characters of context."),
  goal: goalIdSchema,
  persona: personaIdSchema,
  platforms: z.array(platformIdSchema).min(1).max(11),
  mediaAssets: z.array(mediaAssetSchema).default([]),
  language: z.enum(["auto", "zh", "en", "bilingual"]).default("auto"),
  customRules: z.array(z.string()).optional(),
  brandBrain: brandBrainSchema.optional()
});

export const kitOutputSchema = z.object({
  platform: platformIdSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  cta: z.string().min(1),
  notes: z.string().min(1),
  strategy: z.string().min(1),
  locked: z.boolean().default(false),
  publishStatus: publishStatusSchema.default("draft"),
  /** AI-generated cover image URL for this platform output */
  imageUrl: z.string().url().optional().or(z.literal("")),
  /** The prompt used to generate the cover image */
  imagePrompt: z.string().optional()
});

export const contentKitSchema = z.object({
  id: z.string(),
  ideaText: z.string(),
  goal: goalIdSchema,
  persona: personaIdSchema,
  platforms: z.array(platformIdSchema),
  mediaAssets: z.array(mediaAssetSchema),
  outputs: z.array(kitOutputSchema),
  status: kitStatusSchema.default("saved"),
  createdAt: z.string()
});

export const performanceMetricsSchema = z.object({
  platform: platformIdSchema,
  impressions: z.number().int().nonnegative().default(0),
  clicks: z.number().int().nonnegative().default(0),
  likes: z.number().int().nonnegative().default(0),
  comments: z.number().int().nonnegative().default(0),
  saves: z.number().int().nonnegative().default(0),
  shares: z.number().int().nonnegative().default(0),
  leads: z.number().int().nonnegative().default(0),
  signups: z.number().int().nonnegative().default(0),
  revenue: z.number().nonnegative().default(0),
  publishedUrl: z.string().url().optional().or(z.literal("")),
  measuredAt: z.string().optional()
});

export const performancePayloadSchema = z.object({
  kitId: z.string(),
  metrics: performanceMetricsSchema
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
export type ContentKit = z.infer<typeof contentKitSchema>;
export type PerformanceMetrics = z.infer<typeof performanceMetricsSchema>;
export type IterationReport = {
  id: string;
  kitId: string;
  summary: string;
  wins: string[];
  problems: string[];
  nextActions: string[];
  createdAt: string;
};
