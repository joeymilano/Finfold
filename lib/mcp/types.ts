import { z } from "zod";
import { goalIdSchema, personaIdSchema, platformIdSchema } from "@/lib/content-schema";
import { MAX_PLATFORMS_PER_GENERATION, SUPPORTED_PLATFORM_COUNT } from "@/lib/platforms";

/** Latest Streamable HTTP MCP version supported by this stateless server. */
export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = [MCP_PROTOCOL_VERSION, "2025-03-26"] as const;
export const MCP_SERVER_NAME = "finfold-mcp-server";
export const MCP_SERVER_VERSION = "1.1.0";

export const mcpAttachmentInputSchema = z.object({
  name: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(1).max(120),
  url: z.string().url().max(2048).optional(),
  dataBase64: z.string().min(4).max(11_200_000).optional()
}).strict().superRefine((attachment, ctx) => {
  if (Boolean(attachment.url) === Boolean(attachment.dataBase64)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide exactly one of url or dataBase64 for each attachment."
    });
  }
});

export const mcpGenerateInputSchema = z.object({
  brief: z.string().max(12_000).default(""),
  goal: goalIdSchema.default("product-launch"),
  persona: personaIdSchema.default("indie-builder"),
  platforms: z.array(platformIdSchema).min(1).max(MAX_PLATFORMS_PER_GENERATION).default(["x", "linkedin"]),
  language: z.enum(["auto", "zh", "en", "bilingual"]).default("auto"),
  attachments: z.array(mcpAttachmentInputSchema).max(6).default([])
}).strict().superRefine((input, ctx) => {
  if (input.brief.trim().length >= 20 || input.attachments.length > 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["brief"],
    message: "Add at least 20 characters of product context or include an attachment."
  });
});

export const mcpPlatformRulesInputSchema = z.object({
  platforms: z.array(platformIdSchema).min(1).max(SUPPORTED_PLATFORM_COUNT).optional()
}).strict();

export const mcpTokenCreateSchema = z.object({
  name: z.string().trim().min(1).max(60).default("My agent")
}).strict();

export type McpGenerateInput = z.infer<typeof mcpGenerateInputSchema>;
export type McpAttachmentInput = z.infer<typeof mcpAttachmentInputSchema>;
