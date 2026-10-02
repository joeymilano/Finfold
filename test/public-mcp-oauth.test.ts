// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { PublicMcpOAuthError, verifyPublicMcpAuthorization } from "@/lib/mcp/oauth";

const originalFetch = globalThis.fetch;
const originalIssuer = process.env.FINFOLD_MCP_OAUTH_ISSUER;
const originalJwks = process.env.FINFOLD_MCP_OAUTH_JWKS_URI;
const originalResource = process.env.FINFOLD_MCP_RESOURCE_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.FINFOLD_MCP_OAUTH_ISSUER = originalIssuer;
  process.env.FINFOLD_MCP_OAUTH_JWKS_URI = originalJwks;
  process.env.FINFOLD_MCP_RESOURCE_URL = originalResource;
});

async function signedToken(audience: string) {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  const kid = crypto.randomUUID();
  process.env.FINFOLD_MCP_OAUTH_ISSUER = "https://auth.example.test/auth/v1";
  process.env.FINFOLD_MCP_OAUTH_JWKS_URI = `https://auth.example.test/${kid}/jwks.json`;
  process.env.FINFOLD_MCP_RESOURCE_URL = "https://www.finfold.app/mcp";
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid, alg: "ES256", use: "sig" }] }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
  return new SignJWT({ client_id: crypto.randomUUID(), scope: "openid" })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(process.env.FINFOLD_MCP_OAUTH_ISSUER)
    .setSubject("f7c08e55-3e0c-44d9-a0e3-718b3a9a798a")
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

describe("public MCP OAuth verification", () => {
  it("accepts a signed, unexpired, least-scope token for the exact MCP audience", async () => {
    const token = await signedToken("https://www.finfold.app/mcp");
    const auth = await verifyPublicMcpAuthorization(new Request("https://www.finfold.app/mcp", {
      headers: { authorization: `Bearer ${token}` }
    }));
    expect(auth).toMatchObject({
      scopes: ["openid"],
      extra: { userId: "f7c08e55-3e0c-44d9-a0e3-718b3a9a798a" }
    });
  });

  it("rejects a valid Supabase-style token minted for a different audience", async () => {
    const token = await signedToken("authenticated");
    await expect(verifyPublicMcpAuthorization(new Request("https://www.finfold.app/mcp", {
      headers: { authorization: `Bearer ${token}` }
    }))).rejects.toBeInstanceOf(PublicMcpOAuthError);
  });
});
