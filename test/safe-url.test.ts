import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HTML_CONTENT_TYPES,
  normalizeExternalHttpUrl,
  safeExternalFetch,
  safeExternalFetchWithTrace,
  validateExternalHttpUrl
} from "@/lib/safe-url";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("external URL validation", () => {
  it("accepts bodyless 304 without MIME headers but still rejects HTML masquerading as a feed", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(new Response("<html>challenge</html>", { headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await safeExternalFetch("https://example.com/feed", { headers: { "If-None-Match": "v1" } },
      { allowedContentTypes: ["application/rss+xml"] })).status).toBe(304);
    await expect(safeExternalFetch("https://example.com/feed", {}, { allowedContentTypes: ["application/rss+xml"] }))
      .rejects.toThrow("unsupported content type");
  });

  it("adds HTTPS when a pasted domain has no protocol", () => {
    expect(normalizeExternalHttpUrl("www.finfold.app")).toBe("https://www.finfold.app");
    expect(normalizeExternalHttpUrl("//finfold.app")).toBe("https://finfold.app");
  });

  it("accepts normal public HTTPS URLs", () => {
    expect(validateExternalHttpUrl("https://example.com/feed.xml").hostname).toBe("example.com");
  });

  it.each([
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.8/internal",
    "http://192.168.1.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[ff02::1]/",
    "http://service.internal/",
    "file:///etc/passwd"
  ])("blocks private or non-HTTP targets: %s", (url) => {
    expect(() => validateExternalHttpUrl(url)).toThrow();
  });

  it("blocks embedded credentials and custom ports", () => {
    expect(() => validateExternalHttpUrl("https://user:pass@example.com/")).toThrow();
    expect(() => validateExternalHttpUrl("https://example.com:8443/")).toThrow();
  });

  it("uses manual redirects, no-store caching, and an abort signal by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html>ok</html>", { headers: { "Content-Type": "text/html; charset=utf-8" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    await safeExternalFetch(
      "https://example.com/page",
      {},
      { allowedContentTypes: HTML_CONTENT_TYPES }
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, requestInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestInit.redirect).toBe("manual");
    expect(requestInit.cache).toBe("no-store");
    expect(requestInit.signal).toBeInstanceOf(AbortSignal);
  });

  it("strips credentials before following a cross-origin redirect", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://cdn.example.net/final" }
        })
      )
      .mockResolvedValueOnce(
        new Response("ok", { headers: { "Content-Type": "text/plain" } })
      );
    vi.stubGlobal("fetch", fetchMock);

    await safeExternalFetch("https://example.com/start", {
      headers: {
        Accept: "text/plain",
        Authorization: "Bearer secret",
        Cookie: "session=secret",
        "X-Api-Key": "secret"
      }
    }, {
      allowedContentTypes: HTML_CONTENT_TYPES
    });

    const firstHeaders = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
    const secondHeaders = new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers);
    expect(firstHeaders.get("authorization")).toBe("Bearer secret");
    expect(secondHeaders.get("authorization")).toBeNull();
    expect(secondHeaders.get("cookie")).toBeNull();
    expect(secondHeaders.get("x-api-key")).toBeNull();
    expect(secondHeaders.get("accept")).toBe("text/plain");
  });

  it("exposes every followed redirect hop for identity recovery", async () => {
    const loginUrl = "https://www.xiaohongshu.com/login?redirectPath=%2Fuser%2Fprofile%2F5f5f";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "https://www.xiaohongshu.com/user/profile/5f5f?xsec_token=share" }
        })
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: loginUrl }
        })
      )
      .mockResolvedValueOnce(
        new Response("<html>小红书</html>", { headers: { "Content-Type": "text/html" } })
      );
    vi.stubGlobal("fetch", fetchMock);

    const trace = await safeExternalFetchWithTrace("https://xhslink.cn/o/abc", {}, {
      allowedContentTypes: HTML_CONTENT_TYPES,
      maxRedirects: 4
    });

    expect(trace.response.status).toBe(200);
    expect(trace.redirectChain).toEqual([
      "https://xhslink.cn/o/abc",
      "https://www.xiaohongshu.com/user/profile/5f5f?xsec_token=share",
      loginUrl
    ]);
  });

  it("rejects request bodies and non-read methods", async () => {
    await expect(
      safeExternalFetch("https://example.com", { method: "POST" })
    ).rejects.toThrow("GET and HEAD");
    await expect(
      safeExternalFetch("https://example.com", { body: "secret" })
    ).rejects.toThrow("cannot include a body");
  });

  it("rejects HTTPS-to-HTTP redirect downgrades", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { Location: "http://example.com/final" }
        })
      )
    );

    await expect(safeExternalFetch("https://example.com/start")).rejects.toThrow("downgrade");
  });

  it("rejects a final response outside the declared MIME allowlist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not html", { headers: { "Content-Type": "application/octet-stream" } })
      )
    );

    await expect(
      safeExternalFetch(
        "https://example.com/download",
        {},
        { allowedContentTypes: HTML_CONTENT_TYPES }
      )
    ).rejects.toThrow("unsupported content type");
  });

  it("revalidates redirect targets before requesting them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "http://169.254.169.254/latest/meta-data" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeExternalFetch("https://example.com/start")).rejects.toThrow(
      "Private or local network"
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
