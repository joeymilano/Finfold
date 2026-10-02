const DEFAULT_APP_ORIGIN = "https://www.finfold.app";

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getFinfoldAppOrigin(): string {
  return withoutTrailingSlash(process.env.NEXT_PUBLIC_APP_URL?.trim() || DEFAULT_APP_ORIGIN);
}

export function getPublicMcpResource(): string {
  return withoutTrailingSlash(
    process.env.FINFOLD_MCP_RESOURCE_URL?.trim() || `${getFinfoldAppOrigin()}/mcp`
  );
}

export function getPublicMcpResourceMetadataUrl(): string {
  return `${getFinfoldAppOrigin()}/.well-known/oauth-protected-resource`;
}

export function getPublicMcpIssuer(): string {
  const configured = process.env.FINFOLD_MCP_OAUTH_ISSUER?.trim();
  if (configured) return withoutTrailingSlash(configured);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return supabaseUrl
    ? `${withoutTrailingSlash(supabaseUrl)}/auth/v1`
    : "";
}

export function getPublicMcpJwksUri(): string {
  const configured = process.env.FINFOLD_MCP_OAUTH_JWKS_URI?.trim();
  if (configured) return configured;

  const issuer = getPublicMcpIssuer();
  return issuer ? `${issuer}/.well-known/jwks.json` : "";
}

export const FINFOLD_PUBLIC_MCP_SCOPES = ["openid"] as const;

export function getPublicMcpChallenge(
  error = "invalid_token",
  errorDescription = "Connect or reconnect your Finfold account to continue."
): string {
  const safeError = error.replace(/["\\]/g, "");
  const safeDescription = errorDescription.replace(/["\\]/g, "");
  return `Bearer resource_metadata="${getPublicMcpResourceMetadataUrl()}", scope="${FINFOLD_PUBLIC_MCP_SCOPES.join(" ")}", error="${safeError}", error_description="${safeDescription}"`;
}
