import { readTextWithLimit } from "@/lib/safe-url";

export const CREDIT_RECONCILIATION_CRON = "17 2 * * *";
// 08:00 Beijing — X morning generation (topics → drafts → review queue).
export const X_PIPELINE_GENERATION_CRON = "0 0 * * *";
// 20:30 Beijing — X engagement pass (watchlist replies), catching the US
// morning-activity window.
export const X_PIPELINE_ENGAGEMENT_CRON = "30 12 * * *";
// 10:30 Beijing — daily WeChat article generation (after the morning radar
// refresh, ahead of the user's midday review window).
export const CONTENT_PIPELINE_GENERATION_CRON = "30 2 * * *";
// 21:30 Beijing — nightly Xiaohongshu card sets, ready for the user's
// 7-9am posting window the next morning.
export const CONTENT_PIPELINE_CARDS_CRON = "30 13 * * *";
const MAX_SCHEDULE_RESPONSE_BYTES = 64 * 1024;

export type WorkerScheduledEvent = {
  readonly scheduledTime: number;
  readonly cron: string;
};

export type InternalScheduleRouteCaller = (
  path: string,
  body: unknown
) => Promise<Response>;

export type ScheduleLogger = {
  log(message: string): void;
  error(message: string): void;
};

export type WorkerScheduleFeatures = {
  wechatPublishingEnabled?: boolean;
  signalDiscoveryEnabled?: boolean;
  xPublishingEnabled?: boolean;
  xPipelineEnabled?: boolean;
  contentPipelineEnabled?: boolean;
};

type GenerationOutboxDispatchResult = {
  ok: true;
  published: number;
  failed: number;
  reaped: number;
};

type ClaimDispatchResult = {
  ok: true;
  claimed: number;
  succeeded: number;
  failed: number;
};

function writeScheduleLog(
  logger: ScheduleLogger,
  level: "log" | "error",
  record: Record<string, string | number | null>
): void {
  logger[level](JSON.stringify(record));
}

async function cancelResponseBody(response: Response | null): Promise<void> {
  try {
    await response?.body?.cancel();
  } catch {
    // The response may already be consumed or locked. Log handling must never
    // turn body cleanup into a second scheduled-task failure.
  }
}

async function readBoundedJsonRecord(
  response: Response
): Promise<Record<string, unknown> | null> {
  try {
    const text = await readTextWithLimit(response, MAX_SCHEDULE_RESPONSE_BYTES);
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function readDispatchResult(
  response: Response
): Promise<GenerationOutboxDispatchResult | null> {
  const value = await readBoundedJsonRecord(response);
  if (
    value?.ok === true &&
    Number.isInteger(value.published) &&
    Number(value.published) >= 0 &&
    Number.isInteger(value.failed) &&
    Number(value.failed) >= 0 &&
    Number.isInteger(value.reaped) &&
    Number(value.reaped) >= 0
  ) {
    return {
      ok: true,
      published: Number(value.published),
      failed: Number(value.failed),
      reaped: Number(value.reaped)
    };
  }
  return null;
}

async function readClaimDispatchResult(
  response: Response
): Promise<ClaimDispatchResult | null> {
  const value = await readBoundedJsonRecord(response);
  if (
    value?.ok === true
    && Number.isInteger(value.claimed) && Number(value.claimed) >= 0
    && Number.isInteger(value.succeeded) && Number(value.succeeded) >= 0
    && Number.isInteger(value.failed) && Number(value.failed) >= 0
  ) {
    return {
      ok: true,
      claimed: Number(value.claimed),
      succeeded: Number(value.succeeded),
      failed: Number(value.failed)
    };
  }
  return null;
}

export async function runGenerationOutboxSchedule(
  event: WorkerScheduledEvent,
  callInternalRoute: InternalScheduleRouteCaller,
  logger: ScheduleLogger = console
): Promise<boolean> {
  let response: Response | null = null;
  try {
    response = await callInternalRoute("/api/internal/generation/dispatch", {
      scheduledTime: event.scheduledTime
    });

    if (!response.ok) {
      writeScheduleLog(logger, "error", {
        event: "generation_outbox_schedule_failed",
        status: response.status,
        scheduled_time: event.scheduledTime,
        cron: event.cron
      });
      await cancelResponseBody(response);
      return false;
    }

    const result = await readDispatchResult(response);
    if (!result) {
      writeScheduleLog(logger, "error", {
        event: "generation_outbox_schedule_failed",
        status: response.status,
        scheduled_time: event.scheduledTime,
        cron: event.cron,
        reason: "invalid_response"
      });
      await cancelResponseBody(response);
      return false;
    }

    const record = {
      event:
        result.failed > 0
          ? "generation_outbox_dispatch_failed"
          : "generation_outbox_dispatch_completed",
      scheduled_time: event.scheduledTime,
      cron: event.cron,
      published: result.published,
      failed: result.failed,
      // Jobs whose attempt_count hit the cap were failed-and-refunded
      // instead of republished — never silently dropped, always logged.
      reaped: result.reaped
    };
    writeScheduleLog(logger, result.failed > 0 ? "error" : "log", record);
    return result.failed === 0;
  } catch {
    writeScheduleLog(logger, "error", {
      event: "generation_outbox_schedule_failed",
      status: response?.status ?? null,
      scheduled_time: event.scheduledTime,
      cron: event.cron,
      reason: "exception"
    });
    await cancelResponseBody(response);
    return false;
  }
}

export async function runCreditReconciliationSchedule(
  event: WorkerScheduledEvent,
  callInternalRoute: InternalScheduleRouteCaller,
  logger: ScheduleLogger = console
): Promise<boolean> {
  let response: Response | null = null;
  try {
    response = await callInternalRoute("/api/internal/credits/reconcile", {
      scheduledTime: event.scheduledTime
    });
    if (!response.ok) {
      writeScheduleLog(logger, "error", {
        event: "credit_reconciliation_schedule_failed",
        status: response.status,
        scheduled_time: event.scheduledTime,
        cron: event.cron
      });
      await cancelResponseBody(response);
      return false;
    }
    const value = await readBoundedJsonRecord(response);
    if (value?.ok !== true) {
      writeScheduleLog(logger, "error", {
        event: "credit_reconciliation_schedule_failed",
        status: response.status,
        scheduled_time: event.scheduledTime,
        cron: event.cron,
        reason: "invalid_response"
      });
      await cancelResponseBody(response);
      return false;
    }
    return true;
  } catch {
    writeScheduleLog(logger, "error", {
      event: "credit_reconciliation_schedule_failed",
      status: response?.status ?? null,
      scheduled_time: event.scheduledTime,
      cron: event.cron,
      reason: "exception"
    });
    await cancelResponseBody(response);
    return false;
  }
}

export async function runExtensionCleanupSchedule(
  event: WorkerScheduledEvent,
  callInternalRoute: InternalScheduleRouteCaller,
  logger: ScheduleLogger = console
): Promise<boolean> {
  let response: Response | null = null;
  try {
    response = await callInternalRoute("/api/internal/extension/cleanup", {
      scheduledTime: event.scheduledTime
    });
    if (!response.ok) {
      writeScheduleLog(logger, "error", {
        event: "extension_cleanup_schedule_failed",
        status: response.status,
        scheduled_time: event.scheduledTime,
        cron: event.cron
      });
      await cancelResponseBody(response);
      return false;
    }
    const value = await readBoundedJsonRecord(response);
    if (value?.ok !== true) {
      writeScheduleLog(logger, "error", {
        event: "extension_cleanup_schedule_failed",
        status: response.status,
        scheduled_time: event.scheduledTime,
        cron: event.cron,
        reason: "invalid_response"
      });
      return false;
    }
    return true;
  } catch {
    writeScheduleLog(logger, "error", {
      event: "extension_cleanup_schedule_failed",
      status: response?.status ?? null,
      scheduled_time: event.scheduledTime,
      cron: event.cron,
      reason: "exception"
    });
    await cancelResponseBody(response);
    return false;
  }
}

export async function runWechatPublicationSchedule(
  event: WorkerScheduledEvent,
  callInternalRoute: InternalScheduleRouteCaller,
  logger: ScheduleLogger = console
): Promise<boolean> {
  let response: Response | null = null;
  try {
    response = await callInternalRoute("/api/internal/wechat/publications/dispatch", {
      scheduledTime: event.scheduledTime
    });
    if (!response.ok) {
      writeScheduleLog(logger, "error", {
        event: "wechat_publication_schedule_failed",
        status: response.status,
        scheduled_time: event.scheduledTime,
        cron: event.cron
      });
      await cancelResponseBody(response);
      return false;
    }
    const result = await readClaimDispatchResult(response);
    if (!result) {
      writeScheduleLog(logger, "error", {
        event: "wechat_publication_schedule_failed",
        status: response.status,
        scheduled_time: event.scheduledTime,
        cron: event.cron,
        reason: "invalid_response"
      });
      await cancelResponseBody(response);
      return false;
    }
    writeScheduleLog(logger, result.failed > 0 ? "error" : "log", {
      event: result.failed > 0 ? "wechat_publication_dispatch_failed" : "wechat_publication_dispatch_completed",
      scheduled_time: event.scheduledTime,
      cron: event.cron,
      claimed: result.claimed,
      succeeded: result.succeeded,
      failed: result.failed
    });
    return result.failed === 0;
  } catch {
    writeScheduleLog(logger, "error", {
      event: "wechat_publication_schedule_failed",
      status: response?.status ?? null,
      scheduled_time: event.scheduledTime,
      cron: event.cron,
      reason: "exception"
    });
    await cancelResponseBody(response);
    return false;
  }
}

export async function runXPublicationDispatchSchedule(
  event: WorkerScheduledEvent,
  callInternalRoute: InternalScheduleRouteCaller,
  logger: ScheduleLogger = console
): Promise<boolean> {
  let response: Response | null = null;
  try {
    response = await callInternalRoute("/api/internal/x/publications/dispatch", {
      scheduledTime: event.scheduledTime
    });
    if (!response.ok) {
      writeScheduleLog(logger, "error", {
        event: "x_publication_dispatch_schedule_failed",
        status: response.status,
        scheduled_time: event.scheduledTime,
        cron: event.cron
      });
      await cancelResponseBody(response);
      return false;
    }
    const result = await readClaimDispatchResult(response);
    if (!result) {
      writeScheduleLog(logger, "error", {
        event: "x_publication_dispatch_schedule_failed",
        status: response.status,
        scheduled_time: event.scheduledTime,
        cron: event.cron,
        reason: "invalid_response"
      });
      await cancelResponseBody(response);
      return false;
    }
    writeScheduleLog(logger, result.failed > 0 ? "error" : "log", {
      event: result.failed > 0 ? "x_publication_dispatch_failed" : "x_publication_dispatch_completed",
      scheduled_time: event.scheduledTime,
      cron: event.cron,
      claimed: result.claimed,
      succeeded: result.succeeded,
      failed: result.failed
    });
    return result.failed === 0;
  } catch {
    writeScheduleLog(logger, "error", {
      event: "x_publication_dispatch_schedule_failed",
      status: response?.status ?? null,
      scheduled_time: event.scheduledTime,
      cron: event.cron,
      reason: "exception"
    });
    await cancelResponseBody(response);
    return false;
  }
}

export async function runXPipelineGenerationSchedule(
  event: WorkerScheduledEvent,
  phase: "generation" | "engagement",
  callInternalRoute: InternalScheduleRouteCaller,
  logger: ScheduleLogger = console
): Promise<boolean> {
  let response: Response | null = null;
  try {
    response = await callInternalRoute("/api/internal/x/pipeline/run", {
      scheduledTime: event.scheduledTime,
      phase
    });
    const value = response.ok ? await readBoundedJsonRecord(response) : null;
    if (value?.ok === true) {
      writeScheduleLog(logger, "log", {
        event: phase === "generation" ? "x_pipeline_generation_completed" : "x_pipeline_engagement_completed",
        scheduled_time: event.scheduledTime,
        cron: event.cron
      });
      return true;
    }
    writeScheduleLog(logger, "error", {
      event: "x_pipeline_schedule_failed",
      status: response?.status ?? null,
      scheduled_time: event.scheduledTime,
      cron: event.cron,
      reason: response?.ok ? "invalid_response" : "http_error"
    });
    await cancelResponseBody(response);
    return false;
  } catch {
    writeScheduleLog(logger, "error", {
      event: "x_pipeline_schedule_failed",
      status: response?.status ?? null,
      scheduled_time: event.scheduledTime,
      cron: event.cron,
      reason: "exception"
    });
    await cancelResponseBody(response);
    return false;
  }
}

export async function runContentPipelineGenerationSchedule(
  event: WorkerScheduledEvent,
  phase: "articles" | "cards",
  callInternalRoute: InternalScheduleRouteCaller,
  logger: ScheduleLogger = console
): Promise<boolean> {
  let response: Response | null = null;
  try {
    response = await callInternalRoute("/api/internal/content-pipeline/run", {
      scheduledTime: event.scheduledTime,
      phase
    });
    const value = response.ok ? await readBoundedJsonRecord(response) : null;
    if (value?.ok === true) {
      writeScheduleLog(logger, "log", {
        event: phase === "articles" ? "content_pipeline_generation_completed" : "content_pipeline_cards_completed",
        scheduled_time: event.scheduledTime,
        cron: event.cron
      });
      return true;
    }
    writeScheduleLog(logger, "error", {
      event: "content_pipeline_schedule_failed",
      status: response?.status ?? null,
      scheduled_time: event.scheduledTime,
      cron: event.cron,
      reason: response?.ok ? "invalid_response" : "http_error"
    });
    await cancelResponseBody(response);
    return false;
  } catch {
    writeScheduleLog(logger, "error", {
      event: "content_pipeline_schedule_failed",
      status: response?.status ?? null,
      scheduled_time: event.scheduledTime,
      cron: event.cron,
      reason: "exception"
    });
    await cancelResponseBody(response);
    return false;
  }
}

export async function runWorkerSchedule(
  event: WorkerScheduledEvent,
  callInternalRoute: InternalScheduleRouteCaller,
  logger: ScheduleLogger = console,
  features: WorkerScheduleFeatures = {}
): Promise<void> {
  const wechatPublishingEnabled = features.wechatPublishingEnabled === true;
  const xPublishingEnabled = features.xPublishingEnabled === true;
  const discovery = features.signalDiscoveryEnabled ? runSignalDiscoverySchedule(event, callInternalRoute, logger) : Promise.resolve(true);
  const xDispatch = xPublishingEnabled
    ? runXPublicationDispatchSchedule(event, callInternalRoute, logger)
    : Promise.resolve(true);
  const xPipelinePhase = features.xPipelineEnabled === true
    ? (event.cron === X_PIPELINE_ENGAGEMENT_CRON
        ? "engagement"
        : event.cron === X_PIPELINE_GENERATION_CRON
          ? "generation"
          : null)
    : null;
  const xPipeline = xPipelinePhase
    ? runXPipelineGenerationSchedule(event, xPipelinePhase, callInternalRoute, logger)
    : Promise.resolve(true);
  const contentPipelinePhase = features.contentPipelineEnabled === true
    ? (event.cron === CONTENT_PIPELINE_CARDS_CRON
        ? "cards"
        : event.cron === CONTENT_PIPELINE_GENERATION_CRON
          ? "articles"
          : null)
    : null;
  const contentPipeline = contentPipelinePhase
    ? runContentPipelineGenerationSchedule(event, contentPipelinePhase, callInternalRoute, logger)
    : Promise.resolve(true);
  if (event.cron === CREDIT_RECONCILIATION_CRON) {
    // Start both independent daily operations before awaiting either one. A
    // stalled dispatch must not prevent reconciliation from beginning; the
    // caller applies a bounded request signal and the aggregate still fails if
    // either operation does not complete successfully.
    const [dispatchSucceeded, wechatSucceeded, reconciliationSucceeded, extensionCleanupSucceeded, discoverySucceeded, xSucceeded, xPipelineSucceeded, contentPipelineSucceeded] = await Promise.all([
      runGenerationOutboxSchedule(event, callInternalRoute, logger),
      wechatPublishingEnabled
        ? runWechatPublicationSchedule(event, callInternalRoute, logger)
        : Promise.resolve(true),
      runCreditReconciliationSchedule(event, callInternalRoute, logger),
      runExtensionCleanupSchedule(event, callInternalRoute, logger),
      discovery,
      xDispatch,
      xPipeline,
      contentPipeline
    ]);
    if (!dispatchSucceeded || !wechatSucceeded || !reconciliationSucceeded || !extensionCleanupSucceeded || !discoverySucceeded || !xSucceeded || !xPipelineSucceeded || !contentPipelineSucceeded) {
      throw new Error("One or more scheduled Finfold operations failed.");
    }
    return;
  }

  const [dispatchSucceeded, wechatSucceeded, discoverySucceeded, xSucceeded, xPipelineSucceeded, contentPipelineSucceeded] = await Promise.all([
    runGenerationOutboxSchedule(event, callInternalRoute, logger),
    wechatPublishingEnabled
      ? runWechatPublicationSchedule(event, callInternalRoute, logger)
      : Promise.resolve(true),
    discovery,
    xDispatch,
    xPipeline,
    contentPipeline
  ]);
  if (!dispatchSucceeded || !wechatSucceeded || !discoverySucceeded || !xSucceeded || !xPipelineSucceeded || !contentPipelineSucceeded) {
    throw new Error("One or more scheduled Finfold operations failed.");
  }
}

export async function runSignalDiscoverySchedule(event: WorkerScheduledEvent, call: InternalScheduleRouteCaller, logger: ScheduleLogger = console): Promise<boolean> {
  let response: Response | null = null;
  try {
    response = await call("/api/internal/signals/process", { scheduledTime: event.scheduledTime });
    const result = response.ok ? await readBoundedJsonRecord(response) : null;
    if (result?.ok === true) return true;
  } catch { /* Other scheduled jobs continue independently. */ }
  await cancelResponseBody(response);
  writeScheduleLog(logger, "error", { event: "signal_discovery_schedule_failed", status: response?.status ?? null });
  return false;
}
