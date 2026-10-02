import { z } from "zod";

/**
 * Client-safe schema module. Components validate pending Agent mutations
 * against these shapes before rendering, so this file must stay free of
 * server-only imports (no lib/llm chain, no supabase/next-headers).
 */
export const legacyStyleProfileSchema = z.object({
  toneKeywords: z.array(z.string().max(20)).max(8),
  styleRules: z.array(z.string().max(200)).max(8),
  sampleSnippets: z.array(z.string().max(300)).max(3)
});

export type StyleProfile = z.infer<typeof legacyStyleProfileSchema>;

export const creatorStyleSampleSchema = z.object({
  id: z.string().trim().min(1).max(48),
  title: z.string().trim().min(1).max(180),
  sourceType: z.enum(["pasted_text", "screenshot", "public_post", "performance_export"]),
  text: z.string().trim().min(20).max(6000),
  url: z.string().trim().url().max(2048).optional().or(z.literal("")),
  metrics: z.object({
    views: z.number().finite().nonnegative().optional(),
    likes: z.number().finite().nonnegative().optional(),
    saves: z.number().finite().nonnegative().optional(),
    comments: z.number().finite().nonnegative().optional(),
    shares: z.number().finite().nonnegative().optional()
  }).partial().optional()
});

export const creatorStyleAnalysisInputSchema = z.object({
  creatorName: z.string().trim().min(1).max(120),
  profileUrl: z.string().trim().url().max(2048),
  samples: z.array(creatorStyleSampleSchema).min(3).max(12)
}).superRefine((input, ctx) => {
  if (new Set(input.samples.map((sample) => sample.id)).size !== input.samples.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["samples"],
      message: "Creator samples must use unique evidence IDs."
    });
  }
});

const evidencedFindingSchema = z.object({
  finding: z.string().trim().min(1).max(360),
  evidenceIds: z.array(z.string().trim().min(1).max(48)).min(1).max(8)
});

export const creatorStyleModelProfileSchema = z.object({
  creatorName: z.string().trim().min(1).max(120),
  profileUrl: z.string().trim().url().max(2048),
  performanceStatus: z.enum(["performance_evidence_supplied", "unverified_reference"]),
  confidence: z.enum(["low", "medium", "high"]),
  audienceAndTopics: z.array(evidencedFindingSchema).min(1).max(6),
  hooksAndPackaging: z.array(evidencedFindingSchema).min(1).max(6),
  structureAndRhythm: z.array(evidencedFindingSchema).min(1).max(6),
  proofAndTrust: z.array(evidencedFindingSchema).min(1).max(6),
  engagementAndConversion: z.array(evidencedFindingSchema).min(1).max(6),
  toneKeywords: z.array(z.string().trim().min(1).max(24)).max(8),
  transferableRules: z.array(evidencedFindingSchema).min(1).max(8),
  doNotCopy: z.array(z.string().trim().min(1).max(240)).min(1).max(8),
  limitations: z.array(z.string().trim().min(1).max(360)).max(8)
});

export const creatorStyleProfileSchema = creatorStyleModelProfileSchema.extend({
  evidenceSources: z.array(z.object({
    id: z.string().trim().min(1).max(48),
    title: z.string().trim().min(1).max(180),
    sourceType: z.enum(["pasted_text", "screenshot", "public_post", "performance_export"]),
    url: z.string().trim().url().max(2048).optional().or(z.literal("")),
    hasMetrics: z.boolean()
  })).min(3).max(12)
});

export type CreatorStyleSample = z.infer<typeof creatorStyleSampleSchema>;
export type CreatorStyleAnalysisInput = z.infer<typeof creatorStyleAnalysisInputSchema>;
export type CreatorStyleProfile = z.infer<typeof creatorStyleProfileSchema>;
