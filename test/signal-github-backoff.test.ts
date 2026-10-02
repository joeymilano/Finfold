// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { GitHubTrendAdapter } from "@/lib/trends/github-source";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("honors a persisted server cooldown across adapter instances and retries after expiry", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-09T01:00:00Z"));
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 403,
    headers: { "content-type": "application/json", "x-ratelimit-reset": String(Date.now()/1000 + 3600) } }))
    .mockResolvedValueOnce(new Response("[]", { headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  const limited = await new GitHubTrendAdapter("gitroomhq/postiz-app").collect();
  expect(limited).toMatchObject({ ok: false, retryAfter: "2026-09-09T02:00:00.000Z" });
  const deferred = await new GitHubTrendAdapter("gitroomhq/postiz-app").collect({ retryAfter: limited.retryAfter });
  expect(deferred).toMatchObject({ ok: false, signals: [], retryAfter: limited.retryAfter });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.setSystemTime(new Date("2026-09-09T02:00:01Z"));
  expect((await new GitHubTrendAdapter("gitroomhq/postiz-app").collect({ retryAfter: limited.retryAfter })).ok).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("uses Retry-After on 429 and caps excessively long upstream cooldowns", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-09T01:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429,
    headers: { "content-type": "application/json", "retry-after": "99999999" } })));
  expect((await new GitHubTrendAdapter("gitroomhq/postiz-app").collect()).retryAfter).toBe("2026-09-10T01:00:00.000Z");
});
