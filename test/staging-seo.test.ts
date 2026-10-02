import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims: async () => ({ data: {} }) } })
}));

afterEach(() => vi.unstubAllEnvs());

describe("staging index exclusion", () => {
  it.each([false, true])("marks normal and redirect responses with auth configured=%s", async (auth) => {
    vi.stubEnv("FINFOLD_DEPLOYMENT_ENV", "staging");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", auth ? "https://example.supabase.co" : "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", auth ? "test" : "");
    for (const [path, headers] of [
      ["/support", {}],
      ["/", { "accept-language": "en-US" }]
    ] as const) {
      const response = await middleware(new NextRequest(`https://staging.finfold.app${path}`, { headers }));
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
  });

  it("does not add a noindex header on production", async () => {
    vi.stubEnv("FINFOLD_DEPLOYMENT_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const response = await middleware(new NextRequest("https://www.finfold.app/en"));
    expect(response.headers.get("x-robots-tag")).toBeNull();
  });
});
