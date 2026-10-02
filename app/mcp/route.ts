import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { parseBoundedJson, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { createFinfoldPublicMcpServer } from "@/lib/mcp/public-server";
import { getFinfoldAppOrigin, getPublicMcpChallenge } from "@/lib/mcp/public-config";
import { PublicMcpOAuthError, verifyPublicMcpAuthorization } from "@/lib/mcp/oauth";

const PUBLIC_MCP_MAX_BYTES = 256 * 1024;

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return jsonRpcError(403, -32003, "Cross-origin MCP request blocked.");
  }

  const rateLimited = enforceApiRateLimit(request, {
    scope: "public-mcp",
    limit: 90,
    windowMs: 60_000
  });
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await parseBoundedJson(request, PUBLIC_MCP_MAX_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonRpcError(413, -32600, "MCP request body exceeds the 256KB limit.");
    }
    return jsonRpcError(400, -32700, "Invalid JSON request.");
  }

  let authInfo;
  try {
    authInfo = await verifyPublicMcpAuthorization(request);
  } catch (error) {
    if (error instanceof PublicMcpOAuthError) return oauthUnauthorized(error.message);
    return oauthUnauthorized("The Finfold authorization could not be verified.");
  }

  const server = createFinfoldPublicMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  await server.connect(transport);
  return transport.handleRequest(request, { parsedBody: body, authInfo });
}

export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(getFinfoldAppOrigin()).origin;
  } catch {
    return false;
  }
}

function oauthUnauthorized(message: string) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message } },
    { status: 401, headers: { "WWW-Authenticate": getPublicMcpChallenge() } }
  );
}

function jsonRpcError(status: number, code: number, message: string) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code, message } },
    { status }
  );
}
