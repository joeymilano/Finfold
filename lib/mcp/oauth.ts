import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  FINFOLD_PUBLIC_MCP_SCOPES,
  getPublicMcpIssuer,
  getPublicMcpJwksUri,
  getPublicMcpResource
} from "@/lib/mcp/public-config";

const remoteKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export class PublicMcpOAuthError extends Error {
  constructor(message = "The Finfold authorization is missing, expired, or invalid.") {
    super(message);
    this.name = "PublicMcpOAuthError";
  }
}

function getRemoteKeySet(uri: string) {
  const existing = remoteKeySets.get(uri);
  if (existing) return existing;
  const keySet = createRemoteJWKSet(new URL(uri));
  remoteKeySets.set(uri, keySet);
  return keySet;
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization")?.trim();
  if (!header) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  if (!match) throw new PublicMcpOAuthError();
  return match[1];
}

function readScopes(payload: JWTPayload): string[] {
  const raw = payload.scope;
  if (typeof raw === "string") return raw.split(/\s+/).filter(Boolean);
  if (Array.isArray(raw)) return raw.filter((scope): scope is string => typeof scope === "string");
  return [];
}

function hasExactAudience(payload: JWTPayload, expected: string): boolean {
  const audiences = typeof payload.aud === "string" ? [payload.aud] : payload.aud ?? [];
  return audiences.includes(expected);
}

export async function verifyPublicMcpAuthorization(request: Request): Promise<AuthInfo | undefined> {
  const token = readBearerToken(request);
  if (!token) return undefined;

  const issuer = getPublicMcpIssuer();
  const jwksUri = getPublicMcpJwksUri();
  const resource = getPublicMcpResource();
  if (!issuer || !jwksUri) {
    throw new PublicMcpOAuthError("Finfold OAuth is not configured.");
  }

  try {
    const { payload } = await jwtVerify(token, getRemoteKeySet(jwksUri), {
      issuer,
      algorithms: ["RS256", "ES256"]
    });
    if (!payload.sub || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sub)) {
      throw new PublicMcpOAuthError();
    }
    if (!hasExactAudience(payload, resource)) {
      throw new PublicMcpOAuthError();
    }

    const clientId = typeof payload.client_id === "string" ? payload.client_id : "";
    const scopes = readScopes(payload);
    if (!clientId || !FINFOLD_PUBLIC_MCP_SCOPES.every((scope) => scopes.includes(scope))) {
      throw new PublicMcpOAuthError();
    }

    return {
      token,
      clientId,
      scopes,
      expiresAt: payload.exp,
      resource: new URL(resource),
      extra: { userId: payload.sub }
    };
  } catch (error) {
    if (error instanceof PublicMcpOAuthError) throw error;
    throw new PublicMcpOAuthError();
  }
}
