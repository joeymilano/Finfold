import { z } from "zod";
import { goalIdSchema, personaIdSchema, platformIdSchema } from "@/lib/content-schema";
import { MAX_PLATFORMS_PER_GENERATION, SUPPORTED_PLATFORM_COUNT } from "@/lib/platforms";

/** Latest Streamable HTTP MCP version supported by this stateless server. */
export const MCP_PROTOCOL_VERSION = "2025-11-25";
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = [MCP_PROTOCOL_VERSION, "2025-03-26"] as const;
export const MCP_SERVER_NAME = "finfold-mcp-server";
export const MCP_SERVER_VERSION = "1.0.0";

export const mcpGenerateInputSchema = z.object({
  brief: z.string().min(20, "Add at least 20 characters of product context.").max(12_000),
  goal: goalIdSchema.default("product-launch"),
  persona: personaIdSchema.default("indie-builder"),
  platforms: z.array(platformIdSchema).min(1).max(MAX_PLATFORMS_PER_GENERATION).default(["x", "linkedin"]),
  language: z.enum(["auto", "zh", "en", "bilingual"]).default("auto")
}).strict();

export const mcpPlatformRulesInputSchema = z.object({
  platforms: z.array(platformIdSchema).min(1).max(SUPPORTED_PLATFORM_COUNT).optional()
}).strict();

export const mcpTokenCreateSchema = z.object({
  name: z.string().trim().min(1).max(60).default("My agent")
}).strict();

export type McpGenerateInput = z.infer<typeof mcpGenerateInputSchema>;
