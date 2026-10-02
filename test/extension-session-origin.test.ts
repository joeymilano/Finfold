import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/extension/auth", () => ({ authenticateExtensionRequest: vi.fn(async () => null) }));
vi.mock("@/lib/extension/service", () => ({ getExtensionEntitlement: vi.fn() }));
vi.mock("@/lib/extension/usage", () => ({ extensionAuthEnabled: () => true }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: vi.fn() }));
import { GET, OPTIONS } from "@/app/api/extension/v1/session/route";
import { authenticateExtensionRequest } from "@/lib/extension/auth";

const approved = "chrome-extension://lgkoejhkpfpbpebdlbgojngohgghmgpg";
const url = "https://www.finfold.app/api/extension/v1/session";
describe("extension session GET origin handling", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("FINFOLD_EXTENSION_ORIGINS", approved); });
  it("allows an origin-less login probe to reach authentication, not user data", async () => {
    const response = await GET(new Request(url));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({error:{code:"UNAUTHORIZED"}});
    expect(authenticateExtensionRequest).toHaveBeenCalledOnce();
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
  it.each(["https://evil.example", ""]) ("rejects explicit unapproved origin %s before authentication", async origin => {
    const response = await GET(new Request(url, {headers:{origin}}));
    expect(response.status).toBe(403);
    expect(authenticateExtensionRequest).not.toHaveBeenCalled();
  });
  it("lets Chrome 153+'s opaque null origin reach authentication without user data", async () => {
    const response = await GET(new Request(url, {headers:{origin:"null"}}));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({error:{code:"UNAUTHORIZED"}});
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("null");
  });
  it("keeps approved-origin CORS and authentication", async () => {
    const response = await GET(new Request(url, {headers:{origin:approved}}));
    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(approved);
  });
  it("does not allow origin-less CORS preflight", () => {
    expect(OPTIONS(new Request(url,{method:"OPTIONS"})).status).toBe(403);
  });
  it("answers the opaque null-origin preflight so Chrome 153+ side panels can POST", () => {
    const response = OPTIONS(new Request(url, {method:"OPTIONS", headers:{origin:"null"}}));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("null");
  });
});
