import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type Tool
} from "@modelcontextprotocol/sdk/types.js";
import { getBrainCompleteness } from "@/lib/brand-brain";
import type { ContentKit } from "@/lib/content-schema";
import {
  FINFOLD_CONTENT_KIT_WIDGET_HTML,
  FINFOLD_CONTENT_KIT_WIDGET_URI,
  FINFOLD_MCP_APP_MIME
} from "@/lib/mcp/content-kit-widget";
import {
  FINFOLD_PUBLIC_MCP_SCOPES,
  getFinfoldAppOrigin,
  getPublicMcpChallenge
} from "@/lib/mcp/public-config";
import {
  publicMcpCreateKitInputSchema,
  publicMcpGetBrandMemoryInputSchema,
  publicMcpGetKitInputSchema,
  publicMcpGrowthBriefingInputSchema,
  publicMcpListKitsInputSchema,
  publicMcpUpdateBrandMemoryInputSchema
} from "@/lib/mcp/public-types";
import {
  generateMcpKit,
  getMcpBrandContext,
  getMcpBrandMemory,
  getMcpContentKit,
  getMcpGrowthBriefing,
  listMcpContentKits,
  updateMcpBrandMemory
} from "@/lib/mcp/service";
import { captureServerEvent } from "@/lib/posthog-server";

type OpenAITool = Tool & {
  securitySchemes: Array<{ type: "oauth2"; scopes: string[] }>;
};

const oauthSecurity = [{ type: "oauth2" as const, scopes: [...FINFOLD_PUBLIC_MCP_SCOPES] }];
const widgetToolMeta = {
  securitySchemes: oauthSecurity,
  ui: { resourceUri: FINFOLD_CONTENT_KIT_WIDGET_URI },
  "openai/outputTemplate": FINFOLD_CONTENT_KIT_WIDGET_URI,
  "openai/toolInvocation/invoking": "Creating your Finfold content kit…",
  "openai/toolInvocation/invoked": "Content kit saved"
};

const publicKitOutputSchema: NonNullable<Tool["outputSchema"]> = {
  type: "object",
  required: ["kit_id", "title", "status", "has_brand_memory", "open_url", "personalize_url", "outputs"],
  properties: {
    kit_id: { type: "string", format: "uuid" },
    title: { type: "string" },
    status: { type: "string", enum: ["saved"] },
    has_brand_memory: { type: "boolean" },
    open_url: { type: "string", format: "uri" },
    personalize_url: { type: "string", format: "uri" },
    outputs: {
      type: "array",
      items: {
        type: "object",
        required: ["platform", "title", "body", "cta"],
        properties: {
          platform: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          cta: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

const publicKitListOutputSchema: NonNullable<Tool["outputSchema"]> = {
  type: "object",
  required: ["kits", "has_more"],
  properties: {
    kits: {
      type: "array",
      items: {
        type: "object",
        required: ["kit_id", "title", "brief_excerpt", "platforms", "status", "created_at", "open_url"],
        properties: {
          kit_id: { type: "string", format: "uuid" },
          title: { type: "string" },
          brief_excerpt: { type: "string" },
          platforms: { type: "array", items: { type: "string" } },
          status: { type: "string" },
          created_at: { type: "string", format: "date-time" },
          open_url: { type: "string", format: "uri" }
        },
        additionalProperties: false
      }
    },
    has_more: { type: "boolean" }
  },
  additionalProperties: false
};

const publicBrandMemoryOutputSchema: NonNullable<Tool["outputSchema"]> = {
  type: "object",
  required: [
    "identity_type", "brand_name", "product_description", "target_audience", "positioning_statement",
    "tone_keywords", "banned_phrases", "approved_examples", "competitors",
    "learned_style", "learned_negative", "completeness", "has_brand_memory"
  ],
  properties: {
    identity_type: { type: "string", enum: ["personal", "brand", "hybrid"] },
    brand_name: { type: "string" },
    product_description: { type: "string" },
    target_audience: { type: "string" },
    positioning_statement: { type: "string" },
    tone_keywords: { type: "array", items: { type: "string" } },
    banned_phrases: { type: "array", items: { type: "string" } },
    approved_examples: { type: "array", items: { type: "string" } },
    competitors: { type: "array", items: { type: "string" } },
    learned_style: { type: "array", items: { type: "string" } },
    learned_negative: { type: "array", items: { type: "string" } },
    completeness: { type: "number", minimum: 0, maximum: 1 },
    has_brand_memory: { type: "boolean" }
  },
  additionalProperties: false
};

const publicBrandMemoryUpdateOutputSchema: NonNullable<Tool["outputSchema"]> = {
  type: "object",
  required: ["updated", "brand_name", "changed_fields", "completeness"],
  properties: {
    updated: { type: "boolean", enum: [true] },
    brand_name: { type: "string" },
    changed_fields: { type: "array", items: { type: "string" } },
    completeness: { type: "number", minimum: 0, maximum: 1 }
  },
  additionalProperties: false
};

const publicGrowthBriefingOutputSchema: NonNullable<Tool["outputSchema"]> = {
  type: "object",
  required: ["platform", "sample_size", "headline", "summary", "north_star", "funnel", "priorities", "experiment", "missing_data", "daily_impressions", "funnel_totals"],
  properties: {
    platform: { type: ["string", "null"] },
    sample_size: { type: "integer", minimum: 0 },
    headline: { type: "string" },
    summary: { type: "string" },
    north_star: {
      type: "object",
      required: ["label", "value", "evidence"],
      properties: {
        label: { type: "string" },
        value: { type: "string" },
        evidence: { type: "string" }
      },
      additionalProperties: false
    },
    funnel: {
      type: "array",
      items: {
        type: "object",
        required: ["stage", "label", "health", "value", "evidence"],
        properties: {
          stage: { type: "string", enum: ["measurement", "distribution", "click", "retention", "value", "conversion"] },
          label: { type: "string" },
          health: { type: "string", enum: ["critical", "warning", "healthy", "insufficient"] },
          value: { type: "string" },
          evidence: { type: "string" }
        },
        additionalProperties: false
      }
    },
    priorities: {
      type: "array",
      items: {
        type: "object",
        required: ["stage", "title", "evidence", "action", "metric"],
        properties: {
          stage: { type: "string", enum: ["measurement", "distribution", "click", "retention", "value", "conversion"] },
          title: { type: "string" },
          evidence: { type: "string" },
          action: { type: "string" },
          metric: { type: "string" }
        },
        additionalProperties: false
      }
    },
    experiment: {
      anyOf: [{
        type: "object",
        required: ["name", "hypothesis", "primary_metric", "platform", "variants"],
        properties: {
          name: { type: "string" },
          hypothesis: { type: "string" },
          primary_metric: { type: "string" },
          platform: { type: "string" },
          variants: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "angle", "hook_instruction", "format"],
              properties: {
                name: { type: "string" },
                angle: { type: "string" },
                hook_instruction: { type: "string" },
                format: { type: "string" }
              },
              additionalProperties: false
            }
          }
        },
        additionalProperties: false
      }, { type: "null" }]
    },
    missing_data: { type: "array", items: { type: "string" } },
    daily_impressions: {
      type: "array",
      items: {
        type: "object",
        required: ["date", "impressions"],
        properties: { date: { type: "string" }, impressions: { type: "number" } },
        additionalProperties: false
      }
    },
    funnel_totals: {
      anyOf: [{
        type: "object",
        required: ["impressions", "clicks", "views", "interactions", "followers"],
        properties: {
          impressions: { type: "number" },
          clicks: { type: "number" },
          views: { type: "number" },
          interactions: { type: "number" },
          followers: { type: "number" }
        },
        additionalProperties: false
      }, { type: "null" }]
    }
  },
  additionalProperties: false
};

export const FINFOLD_PUBLIC_TOOLS: OpenAITool[] = [
  {
    name: "finfold_list_content_kits",
    title: "List recent Finfold content kits",
    description: "List up to ten of the connected user's most recent Finfold content kits, newest first. Use this before finfold_get_content_kit when the user has not supplied a kit ID. This is read-only and returns brief summaries, not full draft bodies.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 10, default: 5, description: "Maximum number of recent kits to return." }
      },
      additionalProperties: false
    },
    outputSchema: publicKitListOutputSchema,
    securitySchemes: oauthSecurity,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    _meta: {
      securitySchemes: oauthSecurity,
      "openai/toolInvocation/invoking": "Loading your recent Finfold content kits…",
      "openai/toolInvocation/invoked": "Recent content kits loaded"
    }
  },
  {
    name: "finfold_create_content_kit",
    title: "Create a Finfold content kit",
    description: "Turn one brief into one to three platform-native drafts, apply the connected user's Finfold Brand Memory and channel rules, and save the result to their Finfold workspace. This uses the account's normal Finfold AI Credits. It creates drafts only; it never publishes content or changes external accounts.",
    inputSchema: {
      type: "object",
      required: ["request_id", "brief", "platforms"],
      properties: {
        request_id: { type: "string", format: "uuid", description: "A unique UUID for this generation. Reuse it only when retrying the exact same request; Finfold will return the same saved kit without charging again." },
        brief: { type: "string", minLength: 20, maxLength: 12_000, description: "Product update, launch detail, idea, or source material to turn into content." },
        platforms: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          uniqueItems: true,
          items: { type: "string", enum: ["wechat", "xiaohongshu", "zhihu", "moments", "x", "linkedin", "instagram", "facebook", "reddit", "product-hunt", "threads", "hacker-news", "indie-hackers", "medium-substack"] },
          description: "One to three destinations for the drafts."
        },
        language: { type: "string", enum: ["auto", "zh", "en", "bilingual"], default: "auto" },
        goal: { type: "string", enum: ["lead-gen", "audience-growth", "product-launch", "event-promo"], default: "product-launch" }
      },
      additionalProperties: false
    },
    outputSchema: publicKitOutputSchema,
    securitySchemes: oauthSecurity,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    _meta: widgetToolMeta
  },
  {
    name: "finfold_get_content_kit",
    title: "Get a saved Finfold content kit",
    description: "Load one content kit that belongs to the connected Finfold user. Use this when the user refers to a kit ID previously returned by Finfold.",
    inputSchema: {
      type: "object",
      required: ["kit_id"],
      properties: { kit_id: { type: "string", format: "uuid", description: "A Finfold content kit ID." } },
      additionalProperties: false
    },
    outputSchema: publicKitOutputSchema,
    securitySchemes: oauthSecurity,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    _meta: {
      ...widgetToolMeta,
      "openai/toolInvocation/invoking": "Loading your Finfold content kit…",
      "openai/toolInvocation/invoked": "Content kit loaded"
    }
  },
  {
    name: "finfold_get_brand_memory",
    title: "Read Finfold Brand Memory",
    description: "Read the connected user's Finfold Brand Memory: identity, positioning, target audience, tone keywords, banned phrases, competitors, and style rules Finfold learned from their own edits. Use it before writing anything in their voice, when they ask what Finfold knows about them, or to ground finfold_create_content_kit. Finfold applies this memory automatically during generation, so calling it is for context, not a prerequisite.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: publicBrandMemoryOutputSchema,
    securitySchemes: oauthSecurity,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: {
      securitySchemes: oauthSecurity,
      "openai/toolInvocation/invoking": "Reading your Finfold Brand Memory…",
      "openai/toolInvocation/invoked": "Brand Memory loaded"
    }
  },
  {
    name: "finfold_update_brand_memory",
    title: "Update Finfold Brand Memory",
    description: "Merge confirmed facts about the user's brand into their Finfold Brand Memory: identity type, name, offering, audience, positioning, tone keywords, banned phrases, or competitors. Text fields replace the stored value; list fields append with de-duplication. Only call this after the user has explicitly confirmed the facts in the conversation. Rules Finfold learned from the user's own edits are system-managed and never modified here.",
    inputSchema: {
      type: "object",
      properties: {
        identity_type: { type: "string", enum: ["personal", "brand", "hybrid"] },
        brand_name: { type: "string", minLength: 1, maxLength: 60 },
        product_description: { type: "string", minLength: 1, maxLength: 500 },
        target_audience: { type: "string", minLength: 1, maxLength: 300 },
        positioning_statement: { type: "string", minLength: 1, maxLength: 300 },
        tone_keywords: { type: "array", minItems: 1, maxItems: 10, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 20 } },
        banned_phrases: { type: "array", minItems: 1, maxItems: 20, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 40 } },
        competitors: { type: "array", minItems: 1, maxItems: 10, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 40 } }
      },
      additionalProperties: false
    },
    outputSchema: publicBrandMemoryUpdateOutputSchema,
    securitySchemes: oauthSecurity,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: {
      securitySchemes: oauthSecurity,
      "openai/toolInvocation/invoking": "Updating your Finfold Brand Memory…",
      "openai/toolInvocation/invoked": "Brand Memory updated"
    }
  },
  {
    name: "finfold_get_growth_briefing",
    title: "Get Finfold growth briefing",
    description: "Analyze the real publishing performance data the connected user has imported into Finfold and locate the current funnel bottleneck: impressions, clicks, watch time, interactions, and follower conversion. Use it when the user asks why reach is low, what to publish next, or how their account is performing. When no data has been imported yet, it lists exactly which data is missing.",
    inputSchema: {
      type: "object",
      properties: {
        locale: { type: "string", enum: ["zh", "en"], default: "en", description: "Language for the briefing text." },
        platform: { type: "string", description: "Optional Finfold platform ID to focus on, such as xiaohongshu, linkedin, or x." }
      },
      additionalProperties: false
    },
    outputSchema: publicGrowthBriefingOutputSchema,
    securitySchemes: oauthSecurity,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: {
      securitySchemes: oauthSecurity,
      "openai/toolInvocation/invoking": "Analyzing your Finfold performance data…",
      "openai/toolInvocation/invoked": "Growth briefing ready"
    }
  }
];

type ToolAuthExtra = { authInfo?: AuthInfo };

export function createFinfoldPublicMcpServer(): Server {
  const server = new Server(
    { name: "finfold-chatgpt", version: "1.0.0" },
    {
      capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
      instructions: "Finfold creates saved, platform-native content drafts using the connected user's Brand Memory, and analyzes their real publishing performance. Use finfold_create_content_kit when the user asks to turn a brief into channel-ready content — Brand Memory is applied automatically. Use finfold_list_content_kits when the user asks for recent kits without a kit ID, then finfold_get_content_kit for the selected kit. Use finfold_get_brand_memory when writing in the user's voice or checking what Finfold knows about them. After the user confirms brand facts in the conversation, persist them with finfold_update_brand_memory. Use finfold_get_growth_briefing when the user asks why reach is low, what to publish next, or how their account is performing. Never claim that Finfold published the drafts."
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: FINFOLD_PUBLIC_TOOLS }));
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [{
      uri: FINFOLD_CONTENT_KIT_WIDGET_URI,
      name: "Finfold content kit card",
      title: "Finfold content kit",
      description: "A compact preview of a saved Finfold content kit.",
      mimeType: FINFOLD_MCP_APP_MIME
    }]
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri !== FINFOLD_CONTENT_KIT_WIDGET_URI) {
      throw new Error("Unknown Finfold UI resource.");
    }
    return {
      contents: [{
        uri: FINFOLD_CONTENT_KIT_WIDGET_URI,
        mimeType: FINFOLD_MCP_APP_MIME,
        text: FINFOLD_CONTENT_KIT_WIDGET_HTML,
        _meta: {
          ui: {
            prefersBorder: true,
            domain: getFinfoldAppOrigin(),
            csp: { connectDomains: [], resourceDomains: [] }
          },
          "openai/widgetPrefersBorder": true,
          "openai/widgetDomain": getFinfoldAppOrigin(),
          "openai/widgetDescription": "Preview of the user's saved Finfold content kit with up to three platform-native drafts and review actions.",
          "openai/widgetCSP": {
            connect_domains: [],
            resource_domains: [],
            redirect_domains: [getFinfoldAppOrigin()]
          }
        }
      }]
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const auth = (extra as ToolAuthExtra).authInfo;
    const userId = typeof auth?.extra?.userId === "string" ? auth.extra.userId : "";
    if (!userId || !auth?.scopes.includes("openid")) return authenticationRequired();

    try {
      if (request.params.name === "finfold_list_content_kits") {
        const input = publicMcpListKitsInputSchema.parse(request.params.arguments ?? {});
        const result = await listMcpContentKits(userId, input.limit);
        const origin = getFinfoldAppOrigin();
        const campaign = "utm_source=chatgpt_plugin&utm_medium=app&utm_campaign=content_kit_list";
        const output = {
          kits: result.kits.map((kit) => ({
            kit_id: kit.kitId,
            title: kit.title,
            brief_excerpt: kit.briefExcerpt,
            platforms: kit.platforms,
            status: kit.status,
            created_at: kit.createdAt,
            open_url: `${origin}/kits/${encodeURIComponent(kit.kitId)}?${campaign}`
          })),
          has_more: result.hasMore
        };
        void captureServerEvent(userId, "plugin_kits_listed", {
          source: "chatgpt_plugin",
          result_count: output.kits.length,
          requested_limit: input.limit,
          success: true
        });
        return {
          content: [{
            type: "text" as const,
            text: output.kits.length
              ? `Found ${output.kits.length} recent Finfold content kit${output.kits.length === 1 ? "" : "s"}.`
              : "No content kits were found in the connected Finfold account."
          }],
          structuredContent: output
        };
      }

      if (request.params.name === "finfold_create_content_kit") {
        const input = publicMcpCreateKitInputSchema.parse(request.params.arguments ?? {});
        void captureServerEvent(userId, "plugin_generation_started", {
          source: "chatgpt_plugin",
          locale: input.language,
          platform_count: input.platforms.length
        });
        const result = await generateMcpKit(userId, {
          brief: input.brief,
          goal: input.goal,
          persona: "indie-builder",
          platforms: input.platforms,
          language: input.language,
          attachments: []
        }, {
          tokenId: `oauth:${auth.clientId}`,
          idempotencyKey: input.request_id
        });
        const output = toPublicKitResult(result.kit, result.hasBrandMemory);
        void captureServerEvent(userId, "plugin_kit_saved", {
          source: "chatgpt_plugin",
          locale: input.language,
          platform_count: input.platforms.length,
          has_brand_memory: result.hasBrandMemory,
          success: true
        });
        return successResult(output);
      }

      if (request.params.name === "finfold_get_content_kit") {
        const input = publicMcpGetKitInputSchema.parse(request.params.arguments ?? {});
        const [kit, context] = await Promise.all([
          getMcpContentKit(userId, input.kit_id),
          getMcpBrandContext(userId)
        ]);
        if (!kit) return toolError("That content kit was not found in the connected Finfold account.", "not_found");
        return successResult(toPublicKitResult(kit, getBrainCompleteness(context.brain) > 0));
      }

      if (request.params.name === "finfold_get_brand_memory") {
        publicMcpGetBrandMemoryInputSchema.parse(request.params.arguments ?? {});
        const memory = await getMcpBrandMemory(userId);
        void captureServerEvent(userId, "plugin_brand_memory_read", { source: "chatgpt_plugin", success: true });
        return {
          content: [{
            type: "text" as const,
            text: memory.has_brand_memory
              ? `Loaded the connected user's Finfold Brand Memory (identity: ${memory.identity_type}, completeness ${Math.round(memory.completeness * 100)}%).`
              : "The connected Finfold account has no Brand Memory yet. Finfold will still generate content, but it cannot apply the user's voice, audience, or banned phrases until Brand Memory is filled in."
          }],
          structuredContent: memory
        };
      }

      if (request.params.name === "finfold_update_brand_memory") {
        const input = publicMcpUpdateBrandMemoryInputSchema.parse(request.params.arguments ?? {});
        const result = await updateMcpBrandMemory(userId, input);
        void captureServerEvent(userId, "plugin_brand_memory_updated", {
          source: "chatgpt_plugin",
          changed_fields: result.changed_fields,
          success: true
        });
        return {
          content: [{
            type: "text" as const,
            text: result.changed_fields.length
              ? `Finfold Brand Memory updated (${result.changed_fields.join(", ")}). Future generations will use it.`
              : "The confirmed facts already match the stored Finfold Brand Memory, so nothing was changed."
          }],
          structuredContent: result
        };
      }

      if (request.params.name === "finfold_get_growth_briefing") {
        const input = publicMcpGrowthBriefingInputSchema.parse(request.params.arguments ?? {});
        const briefing = await getMcpGrowthBriefing(userId, input.locale, input.platform);
        void captureServerEvent(userId, "plugin_growth_briefing_read", {
          source: "chatgpt_plugin",
          sample_size: briefing.sample_size,
          success: true
        });
        return {
          content: [{
            type: "text" as const,
            text: briefing.sample_size > 0
              ? `Analyzed ${briefing.sample_size} real performance sample${briefing.sample_size === 1 ? "" : "s"}: ${briefing.headline}`
              : "No publishing performance data has been imported into Finfold yet, so there is nothing to analyze. The missing_data field lists what to import."
          }],
          structuredContent: briefing
        };
      }

      return toolError("Unknown Finfold tool.", "unknown_tool");
    } catch (error) {
      const mapped = publicToolError(error);
      void captureServerEvent(userId, "plugin_mcp_error", {
        source: "chatgpt_plugin",
        error_code: mapped.code,
        success: false
      });
      return toolError(mapped.message, mapped.code);
    }
  });

  return server;
}

export function toPublicKitResult(kit: ContentKit, hasBrandMemory: boolean) {
  const origin = getFinfoldAppOrigin();
  const campaign = "utm_source=chatgpt_plugin&utm_medium=app&utm_campaign=content_kit";
  return {
    kit_id: kit.id,
    title: kit.outputs.length === 1 ? "Your Finfold draft is ready" : `Your ${kit.outputs.length} Finfold drafts are ready`,
    status: "saved" as const,
    has_brand_memory: hasBrandMemory,
    open_url: `${origin}/kits/${encodeURIComponent(kit.id)}?${campaign}`,
    personalize_url: `${origin}/brand-memory?${campaign}`,
    outputs: kit.outputs.map((output) => ({
      platform: output.platform,
      title: output.title,
      body: output.finalBody || output.body,
      cta: output.cta
    }))
  };
}

function successResult(output: ReturnType<typeof toPublicKitResult>) {
  return {
    content: [{
      type: "text" as const,
      text: `Finfold saved ${output.outputs.length} platform-native draft${output.outputs.length === 1 ? "" : "s"}. The user can review and edit them in the saved content kit.`
    }],
    structuredContent: output
  };
}

function authenticationRequired() {
  return {
    isError: true,
    content: [{ type: "text" as const, text: "Connect your Finfold account to create or load a content kit." }],
    _meta: {
      "mcp/www_authenticate": [
        getPublicMcpChallenge("insufficient_scope", "Connect your Finfold account to continue.")
      ]
    }
  };
}

function toolError(message: string, code: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
    _meta: { "finfold/error_code": code }
  };
}

function publicToolError(error: unknown): { message: string; code: string } {
  if (error instanceof z.ZodError) {
    return { message: "The Finfold tool input is invalid. Check the brief, platform IDs, and UUID fields.", code: "invalid_input" };
  }
  const message = error instanceof Error ? error.message : "Finfold could not complete this request.";
  if (/out of AI Credits|insufficient/i.test(message)) {
    return { message: "Generation is unavailable because this Finfold account has no available AI Credits.", code: "credits_unavailable" };
  }
  if (/supports up to .*platform|choose fewer platforms/i.test(message)) {
    return { message: "This Finfold account cannot generate that many platforms at once. Choose fewer platforms.", code: "platform_limit" };
  }
  if (/already completed/i.test(message)) {
    return { message: "This request already completed. Use finfold_get_content_kit with the saved kit ID from the earlier result.", code: "request_already_completed" };
  }
  if (/already being processed/i.test(message)) {
    return { message: "This request is still being processed. Retry the same request_id shortly.", code: "request_in_progress" };
  }
  if (/Credits were refunded/i.test(message)) {
    return { message: "The previous request failed and its AI Credits were refunded. Start a new request with a new request_id.", code: "request_refunded" };
  }
  return {
    message: "Finfold could not complete this request. Please try again. If the problem continues, contact Finfold support.",
    code: "finfold_error"
  };
}
