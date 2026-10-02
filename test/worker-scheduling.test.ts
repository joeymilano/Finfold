import { describe, expect, it, vi } from "vitest";
import {
  runWorkerSchedule,
  type InternalScheduleRouteCaller,
  type ScheduleLogger,
  type WorkerScheduledEvent
} from "@/lib/worker-scheduling";

const minuteEvent: WorkerScheduledEvent = {
  cron: "* * * * *",
  scheduledTime: 1_754_019_120_000
};

const dailyEvent: WorkerScheduledEvent = {
  cron: "17 2 * * *",
  scheduledTime: 1_754_027_420_000
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function captureLogger() {
  const log = vi.fn<(message: string) => void>();
  const error = vi.fn<(message: string) => void>();
  return {
    logger: { log, error } satisfies ScheduleLogger,
    log,
    error
  };
}

function loggedRecord(mock: ReturnType<typeof vi.fn>, index = 0) {
  return JSON.parse(String(mock.mock.calls[index]?.[0])) as Record<
    string,
    unknown
  >;
}

describe("Worker scheduled operations", () => {
  it("starts generation and WeChat dispatch together only after the publishing gate is enabled", async () => {
    const calls: string[] = [];
    const callInternalRoute = vi.fn<InternalScheduleRouteCaller>(async (path) => {
      calls.push(path);
      return path === "/api/internal/generation/dispatch"
        ? jsonResponse({ ok: true, published: 0, failed: 0, reaped: 0 })
        : jsonResponse({ ok: true, claimed: 1, succeeded: 1, failed: 0 });
    });
    const { logger, error } = captureLogger();

    await runWorkerSchedule(minuteEvent, callInternalRoute, logger, { wechatPublishingEnabled: true });

    expect(calls).toEqual([
      "/api/internal/generation/dispatch",
      "/api/internal/wechat/publications/dispatch"
    ]);
    expect(error).not.toHaveBeenCalled();
  });

  it("records a safe structured completion for a successful minute dispatch", async () => {
    const callInternalRoute = vi.fn<InternalScheduleRouteCaller>().mockResolvedValue(
      jsonResponse({ ok: true, published: 3, failed: 0, reaped: 0 })
    );
    const { logger, log, error } = captureLogger();

    await runWorkerSchedule(minuteEvent, callInternalRoute, logger);

    expect(callInternalRoute).toHaveBeenCalledWith(
      "/api/internal/generation/dispatch",
      { scheduledTime: minuteEvent.scheduledTime }
    );
    expect(loggedRecord(log)).toEqual({
      event: "generation_outbox_dispatch_completed",
      scheduled_time: minuteEvent.scheduledTime,
      cron: minuteEvent.cron,
      published: 3,
      failed: 0,
      reaped: 0
    });
    expect(error).not.toHaveBeenCalled();
  });

  it("records returned publish failures at error level", async () => {
    const callInternalRoute = vi.fn<InternalScheduleRouteCaller>().mockResolvedValue(
      jsonResponse({ ok: true, published: 1, failed: 2, reaped: 1 })
    );
    const { logger, log, error } = captureLogger();

    await expect(
      runWorkerSchedule(minuteEvent, callInternalRoute, logger)
    ).rejects.toThrow("scheduled Finfold operations failed");

    expect(log).not.toHaveBeenCalled();
    expect(loggedRecord(error)).toEqual({
      event: "generation_outbox_dispatch_failed",
      scheduled_time: minuteEvent.scheduledTime,
      cron: minuteEvent.cron,
      published: 1,
      failed: 2,
      reaped: 1
    });
  });

  it("continues daily reconciliation after a non-2xx outbox response", async () => {
    const callInternalRoute = vi
      .fn<InternalScheduleRouteCaller>()
      .mockResolvedValueOnce(jsonResponse({ error: "Unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true, issueCount: 0 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const { logger, error } = captureLogger();

    await expect(
      runWorkerSchedule(dailyEvent, callInternalRoute, logger)
    ).rejects.toThrow("scheduled Finfold operations failed");

    expect(callInternalRoute.mock.calls.map(([path]) => path)).toEqual([
      "/api/internal/generation/dispatch",
      "/api/internal/credits/reconcile",
      "/api/internal/extension/cleanup"
    ]);
    expect(loggedRecord(error)).toMatchObject({
      event: "generation_outbox_schedule_failed",
      status: 503,
      scheduled_time: dailyEvent.scheduledTime,
      cron: dailyEvent.cron
    });
  });

  it("continues daily reconciliation after an outbox exception", async () => {
    const callInternalRoute = vi
      .fn<InternalScheduleRouteCaller>()
      .mockRejectedValueOnce(new Error("internal dispatch failed"))
      .mockResolvedValueOnce(jsonResponse({ ok: true, issueCount: 0 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const { logger, error } = captureLogger();

    await expect(
      runWorkerSchedule(dailyEvent, callInternalRoute, logger)
    ).rejects.toThrow("scheduled Finfold operations failed");

    expect(callInternalRoute.mock.calls.map(([path]) => path)).toEqual([
      "/api/internal/generation/dispatch",
      "/api/internal/credits/reconcile",
      "/api/internal/extension/cleanup"
    ]);
    expect(loggedRecord(error)).toMatchObject({
      event: "generation_outbox_schedule_failed",
      status: null,
      reason: "exception"
    });
  });

  it("starts daily reconciliation before a slow dispatch settles", async () => {
    let resolveDispatch!: (response: Response) => void;
    const pendingDispatch = new Promise<Response>((resolve) => {
      resolveDispatch = resolve;
    });
    const callInternalRoute = vi.fn<InternalScheduleRouteCaller>((path) =>
      path === "/api/internal/generation/dispatch"
        ? pendingDispatch
        : Promise.resolve(jsonResponse({ ok: true, issueCount: 0 }))
    );
    const { logger } = captureLogger();

    const scheduled = runWorkerSchedule(dailyEvent, callInternalRoute, logger);

    await vi.waitFor(() => {
      expect(callInternalRoute.mock.calls.map(([path]) => path)).toEqual([
        "/api/internal/generation/dispatch",
        "/api/internal/credits/reconcile",
        "/api/internal/extension/cleanup"
      ]);
    });
    resolveDispatch(jsonResponse({ error: "Unavailable" }, 503));

    await expect(scheduled).rejects.toThrow("scheduled Finfold operations failed");
  });

  it("preserves the reconciliation failure event when its route throws", async () => {
    const callInternalRoute = vi
      .fn<InternalScheduleRouteCaller>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, published: 0, failed: 0, reaped: 0 }))
      .mockRejectedValueOnce(new Error("reconciliation failed"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const { logger, error } = captureLogger();

    await expect(
      runWorkerSchedule(dailyEvent, callInternalRoute, logger)
    ).rejects.toThrow("scheduled Finfold operations failed");

    expect(loggedRecord(error)).toMatchObject({
      event: "credit_reconciliation_schedule_failed",
      status: null,
      scheduled_time: dailyEvent.scheduledTime,
      cron: dailyEvent.cron,
      reason: "exception"
    });
  });

  it("rejects a 200 response whose dispatch envelope does not confirm success", async () => {
    const callInternalRoute = vi
      .fn<InternalScheduleRouteCaller>()
      .mockResolvedValue(jsonResponse({ ok: false, published: 0, failed: 0 }));
    const { logger, log, error } = captureLogger();

    await expect(
      runWorkerSchedule(minuteEvent, callInternalRoute, logger)
    ).rejects.toThrow("scheduled Finfold operations failed");

    expect(log).not.toHaveBeenCalled();
    expect(loggedRecord(error)).toMatchObject({
      event: "generation_outbox_schedule_failed",
      reason: "invalid_response"
    });
  });

  it("rejects an oversized schedule response without buffering it unbounded", async () => {
    const callInternalRoute = vi
      .fn<InternalScheduleRouteCaller>()
      .mockResolvedValue(
        jsonResponse({
          ok: true,
          published: 0,
          failed: 0,
          padding: "x".repeat(70 * 1024)
        })
      );
    const { logger, error } = captureLogger();

    await expect(
      runWorkerSchedule(minuteEvent, callInternalRoute, logger)
    ).rejects.toThrow("scheduled Finfold operations failed");

    expect(loggedRecord(error)).toMatchObject({
      event: "generation_outbox_schedule_failed",
      reason: "invalid_response"
    });
  });

  it("rejects a 200 reconciliation response without an ok envelope", async () => {
    const callInternalRoute = vi
      .fn<InternalScheduleRouteCaller>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, published: 0, failed: 0, reaped: 0 }))
      .mockResolvedValueOnce(jsonResponse({ ok: false, issueCount: 0 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const { logger, error } = captureLogger();

    await expect(
      runWorkerSchedule(dailyEvent, callInternalRoute, logger)
    ).rejects.toThrow("scheduled Finfold operations failed");

    expect(loggedRecord(error)).toMatchObject({
      event: "credit_reconciliation_schedule_failed",
      reason: "invalid_response"
    });
  });

  it("dispatches X publications on the minute cron only behind the publishing gate", async () => {
    const calls: string[] = [];
    const callInternalRoute = vi.fn<InternalScheduleRouteCaller>(async (path) => {
      calls.push(path);
      return path === "/api/internal/generation/dispatch"
        ? jsonResponse({ ok: true, published: 0, failed: 0, reaped: 0 })
        : jsonResponse({ ok: true, claimed: 2, succeeded: 2, failed: 0 });
    });
    const { logger, log, error } = captureLogger();

    await runWorkerSchedule(minuteEvent, callInternalRoute, logger, { xPublishingEnabled: true });

    expect(calls).toContain("/api/internal/x/publications/dispatch");
    const records = log.mock.calls.map((entry) => JSON.parse(String(entry[0])));
    expect(records).toContainEqual(expect.objectContaining({
      event: "x_publication_dispatch_completed",
      claimed: 2,
      succeeded: 2,
      failed: 0
    }));
    expect(error).not.toHaveBeenCalled();

    calls.length = 0;
    log.mockClear();
    await runWorkerSchedule(minuteEvent, callInternalRoute, logger);
    expect(calls).not.toContain("/api/internal/x/publications/dispatch");
  });

  it("records X publication job failures at error level", async () => {
    const callInternalRoute = vi.fn<InternalScheduleRouteCaller>(async (path) =>
      path === "/api/internal/x/publications/dispatch"
        ? jsonResponse({ ok: true, claimed: 1, succeeded: 0, failed: 1 })
        : jsonResponse({ ok: true, published: 0, failed: 0, reaped: 0 })
    );
    const { logger, error } = captureLogger();

    await expect(
      runWorkerSchedule(minuteEvent, callInternalRoute, logger, { xPublishingEnabled: true })
    ).rejects.toThrow("scheduled Finfold operations failed");

    expect(loggedRecord(error)).toMatchObject({
      event: "x_publication_dispatch_failed",
      claimed: 1,
      succeeded: 0,
      failed: 1
    });
  });

  it("routes the morning and evening X pipeline crons to their phases", async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    const callInternalRoute = vi.fn<InternalScheduleRouteCaller>(async (path, body) => {
      calls.push({ path, body });
      return path === "/api/internal/generation/dispatch"
        ? jsonResponse({ ok: true, published: 0, failed: 0, reaped: 0 })
        : jsonResponse({ ok: true });
    });
    const { logger } = captureLogger();

    const morning: WorkerScheduledEvent = { cron: "0 0 * * *", scheduledTime: 1_754_019_120_000 };
    const evening: WorkerScheduledEvent = { cron: "30 12 * * *", scheduledTime: 1_754_023_800_000 };

    await runWorkerSchedule(morning, callInternalRoute, logger, { xPipelineEnabled: true });
    await runWorkerSchedule(evening, callInternalRoute, logger, { xPipelineEnabled: true });

    const pipelineCalls = calls.filter((call) => call.path === "/api/internal/x/pipeline/run");
    expect(pipelineCalls.map((call) => (call.body as { phase: string }).phase)).toEqual([
      "generation",
      "engagement"
    ]);
    // The plain minute cron must not trigger a pipeline phase.
    calls.length = 0;
    await runWorkerSchedule(minuteEvent, callInternalRoute, logger, { xPipelineEnabled: true });
    expect(calls.some((call) => call.path === "/api/internal/x/pipeline/run")).toBe(false);
  });
});
