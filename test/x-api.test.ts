import { describe, expect, it, vi } from "vitest";
import {
  buildXTweetUrl,
  isXRetryableError,
  isXUnauthorizedError,
  postTweet,
  uploadXMedia,
  XApiError
} from "@/lib/x-api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("X API v2 client", () => {
  it("posts a tweet with user-context auth and mapped reply/quote/media fields", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.x.com/2/tweets");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer user-token");
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        text: "Ship the pipeline.",
        reply: { in_reply_to_tweet_id: "1747000000000000000" },
        quote_tweet_id: "1747111111111111111",
        media: { media_ids: ["media-1"] }
      });
      return jsonResponse({ data: { id: "1747222222222222222" } });
    });

    await expect(postTweet("user-token", {
      text: "Ship the pipeline.",
      replyToTweetId: "1747000000000000000",
      quoteTweetId: "1747111111111111111",
      mediaIds: ["media-1"]
    }, fetcher)).resolves.toEqual({ id: "1747222222222222222" });
  });

  it("omits reply, quote, and media sections when they are absent", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ text: "Solo post." });
      return jsonResponse({ data: { id: "1" } });
    });
    await postTweet("user-token", { text: "Solo post." }, fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("surfaces provider error details with status and code for retry routing", async () => {
    const error = await postTweet("user-token", { text: "dup" }, async () =>
      jsonResponse({
        title: "Too Many Requests",
        detail: "Rate limit exceeded.",
        status: 429
      }, 429)
    ).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(XApiError);
    expect(isXRetryableError(error)).toBe(true);
    expect(isXUnauthorizedError(error)).toBe(false);

    const unauthorized = await postTweet("user-token", { text: "x" }, async () =>
      jsonResponse({ title: "Unauthorized", status: 401 }, 401)
    ).catch((value: unknown) => value);
    expect(isXUnauthorizedError(unauthorized)).toBe(true);
    expect(isXRetryableError(unauthorized)).toBe(false);

    const rejected = await postTweet("user-token", { text: "x" }, async () =>
      jsonResponse({ errors: [{ code: 187, message: "Status is a duplicate." }] }, 403)
    ).catch((value: unknown) => value);
    expect(rejected).toBeInstanceOf(XApiError);
    expect((rejected as XApiError).code).toBe(187);
    expect(isXRetryableError(rejected)).toBe(false);
  });

  it("rejects a 200 response without a tweet id instead of trusting it", async () => {
    await expect(postTweet("user-token", { text: "x" }, async () =>
      jsonResponse({ data: {} })
    )).rejects.toBeInstanceOf(XApiError);
  });

  it("uploads media as multipart form data and accepts either response shape", async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.x.com/2/media/upload");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer user-token");
      const form = init?.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect(form.get("media")).toBeInstanceOf(Blob);
      return jsonResponse({ data: { id: "v2-media-id" } });
    });
    await expect(uploadXMedia("user-token", {
      bytes: png,
      contentType: "image/png"
    }, fetcher)).resolves.toEqual({ mediaId: "v2-media-id" });

    await expect(uploadXMedia("user-token", {
      bytes: png,
      contentType: "image/png"
    }, async () => jsonResponse({ media_id_string: "legacy-media-id" }))).resolves.toEqual({
      mediaId: "legacy-media-id"
    });
  });

  it("builds a username-independent tweet URL", () => {
    expect(buildXTweetUrl("1747000000000000000")).toBe(
      "https://x.com/i/web/status/1747000000000000000"
    );
  });
});
