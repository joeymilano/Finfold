export const MCP_TOOL_REQUIRED_SCOPES = {
  finfold_get_brand_context: ["brand:read", "rules:read"],
  finfold_get_platform_rules: ["rules:read"],
  finfold_generate_content: ["content:generate"]
} as const;

export type FinfoldMcpToolName = keyof typeof MCP_TOOL_REQUIRED_SCOPES;

export function isKnownMcpToolName(name: string): name is FinfoldMcpToolName {
  return Object.prototype.hasOwnProperty.call(MCP_TOOL_REQUIRED_SCOPES, name);
}

export function missingMcpToolScopes(
  grantedScopes: readonly string[],
  toolName: string
): string[] {
  if (!isKnownMcpToolName(toolName)) return [];
  const granted = new Set(grantedScopes);
  return MCP_TOOL_REQUIRED_SCOPES[toolName].filter(
    (scope) => !granted.has(scope)
  );
}

export function canAccessMcpTool(
  grantedScopes: readonly string[],
  toolName: string
): boolean {
  return (
    isKnownMcpToolName(toolName) &&
    missingMcpToolScopes(grantedScopes, toolName).length === 0
  );
}
