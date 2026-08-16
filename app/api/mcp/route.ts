
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { authenticateMcpRequest, readMcpIdempotencyKey, type McpTokenRecord } from "@/lib/mcp/auth";
import { generateMcpKit, getMcpBrandContext, getMcpPlatformRules } from "@/lib/mcp/service";
import { canAccessMcpTool, missingMcpToolScopes } from "@/lib/mcp/scopes";
import { MCP_PROTOCOL_VERSION, MCP_SERVER_NAME, MCP_SERVER_VERSION, SUPPORTED_MCP_PROTOCOL_VERSIONS, mcpGenerateInputSchema, mcpPlatformRulesInputSchema } from "@/lib/mcp/types";

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: unknown };

const toolDefinitions = [
  {
    name: "finfold_get_brand_context",
    title: "Get Finfold Brand Context",
    description: "Read the connected Finfold workspace's Brand Memory, brand rules, and enabled industry compliance packs. Use this before proposing messaging or a content plan.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "finfold_get_platform_rules",
    title: "Get Finfold Platform Rules",
    description: "Read Finfold's native writing rules, limits, and anti-patterns for one or more publishing platforms. Use it to plan or review channel-specific content.",
    inputSchema: {
      type: "object",
      properties: { platforms: { type: "array", items: { type: "string" }, description: "Optional Finfold platform IDs. Omit for all platforms." } },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "finfold_generate_content",
    title: "Generate Brand-Native Content",
    description: "Generate and save platform-native content in the connected Finfold workspace. Finfold loads Brand Memory and Brand Rules on the server, applies its platform rule engine, and consumes one workspace generation credit. Send one unique Idempotency-Key HTTP header per generation and reuse it only to retry that same request.",
    inputSchema: {
      type: "object",
      required: ["brief"],
      properties: {
        brief: { type: "string", minLength: 20, maxLength: 12000, description: "Product update, launch detail, or content brief to turn into posts." },
        goal: { type: "string", enum: ["lead-gen", "audience-growth", "product-launch", "event-promo"] },
        persona: { type: "string", description: "Finfold persona ID, such as indie-builder or ai-saas." },
        platforms: { type: "array", items: { type: "string" }, description: "Platform IDs, such as x, linkedin, xiaohongshu, reddit." },
        language: { type: "string", enum: ["auto", "zh", "en", "bilingual"] }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
] as const;

export async function POST(request: Request) {
  // Remote agents normally omit Origin. If a browser does supply one, only
  // accept Finfold's own origin — this is the Streamable HTTP DNS-rebinding
  // defence required by the MCP transport specification.
  if (!isAllowedMcpOrigin(request)) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32003, message: "Cross-origin MCP request blocked." } }, { status: 403 });
  }
  const requestedHeaderVersion = request.headers.get("mcp-protocol-version");
  if (requestedHeaderVersion && !SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(requestedHeaderVersion as typeof SUPPORTED_MCP_PROTOCOL_VERSIONS[number])) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32602, message: "Unsupported MCP protocol version.", data: { supported: SUPPORTED_MCP_PROTOCOL_VERSIONS } } }, { status: 400 });
  }

  const rateLimited = enforceApiRateLimit(request, { scope: "mcp", limit: 90, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  let payload: JsonRpcRequest;
  try {
    payload = z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.string(), z.number(), z.null()]).optional(), method: z.string(), params: z.unknown().optional() }).parse(await request.json());
  } catch {
    return jsonRpcError(null, -32600, "Invalid JSON-RPC request.");
  }

  const token = await authenticateMcpRequest(request);
  if (!token) return jsonRpcError(payload.id ?? null, -32001, "Authentication required. Create an MCP token in Finfold, then send it as a Bearer token.");

  try {
    switch (payload.method) {
      case "initialize":
        // A client supplies its version inside initialize. We keep a
        // stateless transport, so later requests may omit the header for
        // backward-compatible 2025-03-26 clients.
        const requestedVersion = z.object({ protocolVersion: z.string().optional() }).passthrough().safeParse(payload.params).data?.protocolVersion;
        const negotiatedVersion = requestedVersion && SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(requestedVersion as typeof SUPPORTED_MCP_PROTOCOL_VERSIONS[number])
          ? requestedVersion
          : MCP_PROTOCOL_VERSION;
        return jsonRpcResult(payload.id ?? null, {
          protocolVersion: negotiatedVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
          instructions: "Finfold gives your agent access to this user's brand context and platform-specific content engine. Call finfold_get_brand_context before generating content."
        });
      case "notifications/initialized":
        return new Response(null, { status: 202 });
      case "tools/list":
        return jsonRpcResult(payload.id ?? null, {
          tools: toolDefinitions.filter((tool) =>
            canAccessMcpTool(token.scopes, tool.name)
          )
        });
      case "tools/call":
        return await callTool(payload.id ?? null, payload.params, token, request.headers.get("Idempotency-Key"));
      case "ping":
        return jsonRpcResult(payload.id ?? null, {});
      default:
        return jsonRpcError(payload.id ?? null, -32601, `Unknown MCP method: ${payload.method}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Finfold MCP could not complete this request.";
    return jsonRpcResult(payload.id ?? null, toolError(message));
  }
}

export async function GET() {
  // This stateless server returns a JSON response to each POST and does not
  // offer a server-initiated SSE stream. Streamable HTTP explicitly permits
  // 405 for GET in this case.
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

async function callTool(
  id: string | number | null,
  rawParams: unknown,
  token: McpTokenRecord,
  rawIdempotencyKey: string | null
) {
  const params = z.object({ name: z.string(), arguments: z.record(z.unknown()).default({}) }).parse(rawParams ?? {});
  const missingScopes = missingMcpToolScopes(token.scopes, params.name);
  if (missingScopes.length > 0) {
    return jsonRpcResult(
      id,
      toolError(
        `This MCP token lacks the required scope${missingScopes.length > 1 ? "s" : ""}: ${missingScopes.join(", ")}.`
      )
    );
  }

  let output: unknown;
  switch (params.name) {
    case "finfold_get_brand_context":
      output = await getMcpBrandContext(token.user_id);
      break;
    case "finfold_get_platform_rules": {
      const input = mcpPlatformRulesInputSchema.parse(params.arguments);
      output = { rules: getMcpPlatformRules(input.platforms) };
      break;
    }
    case "finfold_generate_content": {
      const input = mcpGenerateInputSchema.parse(params.arguments);
      const idempotencyKey = readMcpIdempotencyKey(rawIdempotencyKey);
      if (!idempotencyKey) {
        return jsonRpcResult(id, toolError("finfold_generate_content requires an Idempotency-Key header containing 8-128 letters, numbers, dots, underscores, colons, or hyphens."));
      }
      output = await generateMcpKit(token.user_id, input, {
        tokenId: token.id,
        idempotencyKey
      });
      break;
    }
    default:
      return jsonRpcResult(id, toolError(`Unknown Finfold tool: ${params.name}. Call tools/list to see available tools.`));
  }
  return jsonRpcResult(id, toolSuccess(output));
}

function toolSuccess(data: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

function toolError(message: string) {
  return { isError: true, content: [{ type: "text", text: `Error: ${message}` }] };
}

function jsonRpcResult(id: string | number | null, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: { "MCP-Protocol-Version": MCP_PROTOCOL_VERSION } });
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: 200, headers: { "MCP-Protocol-Version": MCP_PROTOCOL_VERSION } });
}

function isAllowedMcpOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL;
  return origin === requestOrigin || origin === configuredOrigin;
}
