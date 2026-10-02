import { z } from "zod";
import { goalIdSchema, platformIdSchema } from "@/lib/content-schema";

export const publicMcpCreateKitInputSchema = z.object({
  request_id: z.string().uuid().describe("A unique UUID for this generation. Reuse it only when retrying the exact same request."),
  brief: z.string().trim().min(20).max(12_000).describe("The product update, launch detail, idea, or source material to turn into content."),
  platforms: z.array(platformIdSchema).min(1).max(3)
    .refine((items) => new Set(items).size === items.length, "Choose each platform only once.")
    .describe("One to three Finfold platform IDs."),
  language: z.enum(["auto", "zh", "en", "bilingual"]).default("auto"),
  goal: goalIdSchema.default("product-launch")
}).strict();

export const publicMcpGetKitInputSchema = z.object({
  kit_id: z.string().uuid().describe("The Finfold content kit ID returned by finfold_create_content_kit.")
}).strict();

export const publicMcpListKitsInputSchema = z.object({
  limit: z.number().int().min(1).max(10).default(5)
    .describe("Maximum number of recent content kits to return, from 1 to 10.")
}).strict();

export const publicMcpGetBrandMemoryInputSchema = z.object({}).strict();

export const publicMcpUpdateBrandMemoryInputSchema = z.object({
  identity_type: z.enum(["personal", "brand", "hybrid"]).optional()
    .describe("Whether this memory describes a person, a brand, or a hybrid identity."),
  brand_name: z.string().min(1).max(60).optional()
    .describe("Brand name, or the creator/IP name for a personal identity. Replaces the stored value."),
  product_description: z.string().min(1).max(500).optional()
    .describe("What the brand offers, or the creator's expertise and value. Replaces the stored value."),
  target_audience: z.string().min(1).max(300).optional()
    .describe("Who this identity wants to reach. Replaces the stored value."),
  positioning_statement: z.string().min(1).max(300).optional()
    .describe("One-sentence positioning. Replaces the stored value."),
  tone_keywords: z.array(z.string().min(1).max(20)).min(1).max(10).optional()
    .describe("Voice descriptors appended to the existing list, de-duplicated, capped at 10."),
  banned_phrases: z.array(z.string().min(1).max(40)).min(1).max(20).optional()
    .describe("Phrases to never use, appended to the existing list, de-duplicated, capped at 20."),
  competitors: z.array(z.string().min(1).max(40)).min(1).max(10).optional()
    .describe("Competitor or alternative names, appended to the existing list, de-duplicated, capped at 10.")
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const publicMcpGrowthBriefingInputSchema = z.object({
  locale: z.enum(["zh", "en"]).default("en"),
  platform: platformIdSchema.optional()
    .describe("Focus the briefing on one Finfold platform, such as xiaohongshu or linkedin. Omit to analyze all connected data.")
}).strict();

export type PublicMcpCreateKitInput = z.infer<typeof publicMcpCreateKitInputSchema>;
