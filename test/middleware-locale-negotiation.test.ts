import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

/**
 * Locale negotiation in middleware: English-preferring requests to public
 * Chinese pages (which have an /en mirror) are redirected there so link
 * previews (Teams, Slack, LinkedIn) pick up the English og tags. Chinese
 * visitors, crawlers without Accept-Language, and explicit finfold-locale
 * cookie choices must keep the original URL.
 */

const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  // Without Supabase env vars the middleware degrades gracefully and makes no
  // network calls, keeping these tests hermetic.
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

afterAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_ENV.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

function makeRequest(
  url: string,
  init: ConstructorParameters<typeof NextRequest>[1] = {},
): NextRequest {
  return new NextRequest(url, init);
}

describe("middleware locale negotiation", () => {
  it("redirects an English browser on the Chinese home to /en", async () => {
    const response = await middleware(
      makeRequest("https://www.finfold.app/", {
        headers: { "accept-language": "en-US,en;q=0.9" },
      }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.finfold.app/en");
    expect(response.headers.get("content-language")).toBe("en");
  });

  it("keeps Chinese visitors on the Chinese URL", async () => {
    const response = await middleware(
      makeRequest("https://www.finfold.app/", {
        headers: { "accept-language": "zh-CN,zh;q=0.9" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("treats zh-first Accept-Language as Chinese even when English is listed", async () => {
    const response = await middleware(
      makeRequest("https://www.finfold.app/", {
        headers: { "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("does not redirect crawlers that send no Accept-Language", async () => {
    const response = await middleware(makeRequest("https://www.finfold.app/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("respects an explicit zh cookie over an English Accept-Language", async () => {
    const response = await middleware(
      makeRequest("https://www.finfold.app/", {
        headers: {
          "accept-language": "en-US,en;q=0.9",
          cookie: "finfold-locale=zh",
        },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("redirects to /en when the user chose English via cookie", async () => {
    const response = await middleware(
      makeRequest("https://www.finfold.app/", {
        headers: {
          "accept-language": "zh-CN,zh;q=0.9",
          cookie: "finfold-locale=en",
        },
      }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.finfold.app/en");
  });

  it("maps nested public pages onto their /en mirror and keeps the query string", async () => {
    const response = await middleware(
      makeRequest("https://www.finfold.app/blog/some-post?utm_source=teams", {
        headers: { "accept-language": "en-GB,en;q=0.9" },
      }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.finfold.app/en/blog/some-post?utm_source=teams",
    );
  });

  it("leaves routes without an /en mirror untouched", async () => {
    const response = await middleware(
      makeRequest("https://www.finfold.app/dashboard", {
        headers: { "accept-language": "en-US,en;q=0.9" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("never re-redirects URLs already on the English tree", async () => {
    const response = await middleware(
      makeRequest("https://www.finfold.app/en", {
        headers: { "accept-language": "en-US,en;q=0.9" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("skips negotiation for non-GET requests", async () => {
    const response = await middleware(
      makeRequest("https://www.finfold.app/", {
        method: "POST",
        headers: { "accept-language": "en-US,en;q=0.9" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
