import { z } from "zod";

export const extensionPlatformSchema = z.enum([
  "x",
  "linkedin",
  "xiaohongshu",
  "reddit"
]);
export type ExtensionPlatform = z.infer<typeof extensionPlatformSchema>;

export const extensionLanguageSchema = z.enum(["auto", "zh", "en"]);

export const extensionPageContextSchema = z.object({
  url: z.string().url().max(2_048),
  title: z.string().trim().min(1).max(300),
  siteName: z.string().trim().max(120).default(""),
  description: z.string().trim().max(500).default(""),
  language: z.string().trim().max(35).default(""),
  text: z.string().trim().min(20).max(8_000),
  selectionUsed: z.boolean().default(false)
}).strict();

export const extensionResultSchema = z.object({
  platform: extensionPlatformSchema,
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(8_000),
  summary: z.string().trim().max(300).optional(),
  cta: z.string().trim().min(1).max(500),
  notes: z.string().trim().min(1).max(700),
  strategy: z.string().trim().min(1).max(700)
}).strict();
export type ExtensionResult = z.infer<typeof extensionResultSchema>;

const baseActionRequestSchema = z.object({
  requestId: z.string().uuid(),
  action: z.literal("repurpose"),
  language: extensionLanguageSchema.default("auto"),
  page: extensionPageContextSchema
});

export const anonymousActionRequestSchema = baseActionRequestSchema.extend({
  installationId: z.string().uuid(),
  platform: extensionPlatformSchema
}).strict();
export type AnonymousActionRequest = z.infer<typeof anonymousActionRequestSchema>;

export const authenticatedActionRequestSchema = baseActionRequestSchema.extend({
  platforms: z.array(extensionPlatformSchema).min(1).max(4)
}).strict().superRefine((input, ctx) => {
  const unique = new Set(input.platforms);
  if (unique.size !== input.platforms.length || ![1, 4].includes(input.platforms.length)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["platforms"],
      message: "Choose one platform or the complete four-platform pack."
    });
  }
});
export type AuthenticatedActionRequest = z.infer<typeof authenticatedActionRequestSchema>;

export const claimRequestSchema = z.object({
  requestId: z.string().uuid(),
  receipt: z.string().min(40).max(2_000),
  result: extensionResultSchema
}).strict();

export type ExtensionErrorCode =
  | "BAD_REQUEST"
  | "ORIGIN_NOT_ALLOWED"
  | "FEATURE_DISABLED"
  | "INSTALLATION_LIMIT_REACHED"
  | "IP_RATE_LIMITED"
  | "GLOBAL_LIMIT_REACHED"
  | "REQUEST_IN_PROGRESS"
  | "REQUEST_ALREADY_COMPLETED"
  | "REQUEST_ALREADY_FAILED"
  | "FREE_POOL_UNAVAILABLE"
  | "UNAUTHORIZED"
  | "INSUFFICIENT_CREDITS"
  | "GENERATION_FAILED"
  | "INVALID_CLAIM"
  | "CLAIM_EXPIRED"
  | "CLAIM_ALREADY_USED";
