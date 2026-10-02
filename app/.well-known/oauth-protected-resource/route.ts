import { NextResponse } from "next/server";
import {
  FINFOLD_PUBLIC_MCP_SCOPES,
  getFinfoldAppOrigin,
  getPublicMcpIssuer,
  getPublicMcpResource
} from "@/lib/mcp/public-config";

export async function GET() {
  const origin = getFinfoldAppOrigin();
  return NextResponse.json({
    resource: getPublicMcpResource(),
    authorization_servers: [getPublicMcpIssuer()],
    scopes_supported: [...FINFOLD_PUBLIC_MCP_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Finfold for ChatGPT",
    resource_documentation: `${origin}/for-agents`,
    resource_policy_uri: `${origin}/privacy`,
    resource_tos_uri: `${origin}/terms`
  }, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" }
  });
}
