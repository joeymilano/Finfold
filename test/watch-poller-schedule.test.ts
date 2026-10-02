import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handlePollerRequest,
  jobsForSchedule,
  runStagingReadiness,
  type Env
} from "@/workers/watch-poller/index";

function at(cron: string, isoTime: string) {
  return jobsForSchedule({
    cron,
    scheduledTime: Date.parse(isoTime)
  });
}

describe("watch poller schedule multiplexing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves a read-only worker health contract", async () => {
    const response = handlePollerRequest(
      new Request("https://finfold-watch-poller.example.com/health")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      service: "finfold-watch-poller",
      scope: "worker-only",
      mode: "scheduled",
      schedules: ["0,15 * * * *", "30 * * * *", "30 */3 * * *"]
    });
  });

  it("supports HEAD without a response body", async () => {
    const response = handlePollerRequest(
      new Request("https://finfold-watch-poller.example.com/health", {
        method: "HEAD"
      })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("rejects writes and unknown public paths", async () => {
    const writeResponse = handlePollerRequest(
      new Request("https://finfold-watch-poller.example.com/health", {
        method: "POST"
      })
    );
    const missingResponse = handlePollerRequest(
      new Request("https://finfold-watch-poller.example.com/")
    );

    expect(writeResponse.status).toBe(405);
    expect(writeResponse.headers.get("allow")).toBe("GET, HEAD");
    await expect(writeResponse.json()).resolves.toEqual({
      error: "Method not allowed."
    });
    expect(missingResponse.status).toBe(404);
  });

  it("does not schedule autonomous watch drafting while its AI budget is disabled", () => {
    expect(at("0,15 * * * *", "2026-08-02T00:00:00Z")).not.toContain("watch_sources");
    expect(at("0,15 * * * *", "2026-08-02T06:00:00Z")).not.toContain("watch_sources");
    expect(at("0,15 * * * *", "2026-08-02T05:00:00Z")).not.toContain("watch_sources");
  });

  it("synchronizes opportunity signals every half hour without AI calls", () => {
    expect(at("30 * * * *", "2026-08-02T05:30:00Z")).toEqual(["trend_sync"]);
    expect(at("0,15 * * * *", "2026-08-02T05:00:00Z")).toEqual(["trend_sync"]);
  });

  it("runs the daily patrol at 01:15 UTC", () => {
    expect(at("0,15 * * * *", "2026-08-02T01:15:00Z")).toEqual([
      "agent_patrol"
    ]);
  });

  it("refreshes public demand signals daily without autonomous model calls", () => {
    expect(at("0,15 * * * *", "2026-08-02T01:00:00Z")).toEqual([
      "trend_sync",
      "public_demand_refresh"
    ]);
  });

  it("runs a real staging readiness probe three times per day", () => {
    expect(at("0,15 * * * *", "2026-08-02T02:00:00Z")).toEqual([
      "trend_sync",
      "staging_readiness"
    ]);
    expect(at("0,15 * * * *", "2026-08-02T10:00:00Z")).toEqual([
      "trend_sync",
      "staging_readiness"
    ]);
    expect(at("0,15 * * * *", "2026-08-02T18:00:00Z")).toEqual([
      "trend_sync",
      "staging_readiness"
    ]);
    expect(at("0,15 * * * *", "2026-08-02T11:00:00Z")).toEqual(["trend_sync"]);
  });

  it("keeps staging database activity independent from app readiness", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response('{"status":"ready"}', { status: 200 }));
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runStagingReadiness({
      FINFOLD_STAGING_URL: "https://staging.example.com",
      STAGING_SUPABASE_URL: "https://staging-project.supabase.co",
      STAGING_SUPABASE_ANON_KEY: "public-anon-key"
    } as Env);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url: url.toString(),
      init
    }));
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: "https://staging-project.supabase.co/rest/v1/profiles?select=id&limit=1",
        init: expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({ apikey: "public-anon-key" })
        })
      }),
      expect.objectContaining({
        url: "https://staging.example.com/api/health/ready",
        init: expect.objectContaining({ method: "GET" })
      })
    ]));
  });

  it("fails the scheduled invocation when either staging probe fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runStagingReadiness({
      FINFOLD_STAGING_URL: "https://staging.example.com",
      STAGING_SUPABASE_URL: "https://staging-project.supabase.co",
      STAGING_SUPABASE_ANON_KEY: "public-anon-key"
    } as Env)).rejects.toThrow("staging readiness probes failed");
  });

  it("schedules deterministic weekly performance learning while its AI budget is disabled", () => {
    expect(at("0,15 * * * *", "2026-08-03T04:00:00Z")).toEqual(["trend_sync", "performance_learning"]);
    expect(at("0,15 * * * *", "2026-08-03T00:00:00Z")).toEqual(["trend_sync"]);
  });

  it("keeps performance polling on its independent three-hour cadence", () => {
    expect(at("30 */3 * * *", "2026-08-02T03:30:00Z")).toEqual([
      "performance_poll"
    ]);
  });

  it("ignores unknown trigger expressions", () => {
    expect(at("* * * * *", "2026-08-02T00:00:00Z")).toEqual([]);
  });
});
