#!/usr/bin/env node
/**
 * Finfold 自部署调度守护进程（www.finfold.cn 国内站专用）。
 *
 * 在普通 Node 服务器上复刻两个 Cloudflare Worker 承担的职责，业务逻辑
 * 本身始终留在 Next.js 内部 API 路由里，与生产环境共用同一套代码：
 *
 * 1. 生成任务执行（替代主 Worker 的 Cloudflare Queue 消费者）
 *    应用在 GENERATION_EXECUTION_MODE=queue 下把任务写入 Supabase 的
 *    generation_jobs outbox 表；没有队列绑定时 publishGenerationJob 会把
 *    行留在 pending 状态。本进程轮询 pending 行，按 worker.ts 相同的契约
 *    POST /api/generate（x-finfold-internal-worker-secret + 队列尝试次数头），
 *    并解析 SSE worker 事件。重试/退避/死信全部由数据库状态机
 *    （claim/retry/finish_generation_job RPC）驱动，本进程不重复实现。
 *
 * 2. 定时任务（替代主 Worker 的 Cron Triggers + watch-poller Worker 的
 *    cron，时刻与 wrangler.toml / workers/watch-poller 的 UTC cron 对齐）：
 *    - 每分钟：outbox 兜底 dispatch、信号发现、X 发布派发（按开关）
 *    - 02:17 UTC：以上 + 积分对账 + 扩展数据清理
 *    - 00:00 / 12:30 UTC：以上 + X 流水线生成/互动阶段
 *    - 每小时 :00 / :30：机会雷达趋势同步（CRON_WATCH_SECRET）
 *    - 每 3 小时 :30：社媒表现轮询（CRON_PERF_SECRET）
 *    - 01:00 UTC：公开需求信号刷新；01:15：Agent 巡逻（CRON_PERF_SECRET）
 *    - 周一 04:00 UTC：表现学习蒸馏（CRON_PERF_SECRET）
 *
 * 运行方式见 docs/deploy-cn.md；环境变量来自 .env.cn（与 Web 进程共享）。
 * 独立进程、无框架依赖：Node 18+ 原生 fetch 即可。
 */

import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

function loadEnvFile(path) {
  try {
    const source = readFileSync(path, "utf8");
    for (const line of source.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // 环境文件可选：systemd 已通过 EnvironmentFile 注入时无需重复加载。
  }
}

loadEnvFile(new URL("../../.env.cn", import.meta.url).pathname);

function clampInt(raw, min, max, fallback) {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const CONFIG = {
  internalOrigin: (
    process.env.FINFOLD_INTERNAL_ORIGIN || "http://127.0.0.1:3000"
  ).replace(/\/+$/, ""),
  workerSecret: process.env.GENERATION_WORKER_SECRET || "",
  cronWatchSecret: process.env.CRON_WATCH_SECRET || "",
  cronPerfSecret: process.env.CRON_PERF_SECRET || "",
  supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, ""),
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  concurrency: clampInt(process.env.GENERATION_CONCURRENCY, 1, 12, 3),
  sweepIntervalMs: clampInt(process.env.GENERATION_SWEEP_INTERVAL_MS, 1000, 60_000, 3000),
  jobTimeoutMs: clampInt(process.env.GENERATION_JOB_TIMEOUT_MS, 60_000, 3_600_000, 900_000),
  routeTimeoutMs: 60_000,
  maxResponseBytes: 64 * 1024,
  failureCooldownMs: 60_000,
  features: {
    signalDiscovery: process.env.SIGNAL_DISCOVERY_ENABLED === "true",
    xPublishing: process.env.X_PUBLISHING_ENABLED === "true",
    xPipeline: process.env.X_PIPELINE_ENABLED === "true",
    wechatPublishing:
      process.env.WECHAT_COMPONENT_ENABLED === "true" &&
      process.env.WECHAT_DRAFT_PUBLISHING_ENABLED === "true"
  }
};

for (const [name, value] of [
  ["GENERATION_WORKER_SECRET", CONFIG.workerSecret],
  ["NEXT_PUBLIC_SUPABASE_URL", CONFIG.supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY", CONFIG.serviceRoleKey]
]) {
  if (!value) {
    console.error(JSON.stringify({ event: "scheduler_config_missing", variable: name }));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 日志
// ---------------------------------------------------------------------------

function log(event, fields = {}) {
  console.log(JSON.stringify({ event, time: new Date().toISOString(), ...fields }));
}

function logError(event, fields = {}) {
  console.error(JSON.stringify({ event, time: new Date().toISOString(), ...fields }));
}

// ---------------------------------------------------------------------------
// 生成任务执行（对应 worker.ts 的队列消费者契约）
// ---------------------------------------------------------------------------

const INTERNAL_WORKER_SECRET_HEADER = "x-finfold-internal-worker-secret";
const TERMINAL_WORKER_STATUSES = new Set([
  "succeeded",
  "partial_success",
  "terminal",
  "busy",
  "retry",
  "failed"
]);

function parseWorkerOutcome(stream) {
  for (const block of stream.split("\n\n")) {
    const lines = block.split("\n");
    if (!lines.includes("event: worker")) continue;
    const data = lines.find((line) => line.startsWith("data: "));
    if (!data) return null;
    try {
      const parsed = JSON.parse(data.slice(6));
      if (TERMINAL_WORKER_STATUSES.has(parsed.status)) return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

async function readBounded(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > CONFIG.maxResponseBytes) {
      await reader.cancel("Internal response exceeded its bounded contract.");
      throw new Error("Internal response exceeded 64 KiB.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

const inFlightJobs = new Set();
const jobCooldownUntil = new Map();

async function fetchPendingJobs(limit) {
  const nowIso = encodeURIComponent(new Date().toISOString());
  const url =
    `${CONFIG.supabaseUrl}/rest/v1/generation_jobs` +
    `?select=id,run_id,attempt_count` +
    `&status=eq.pending&available_at=lte.${nowIso}` +
    `&order=created_at.asc&limit=${limit}`;
  const response = await fetch(url, {
    headers: {
      apikey: CONFIG.serviceRoleKey,
      authorization: `Bearer ${CONFIG.serviceRoleKey}`
    }
  });
  if (!response.ok) {
    throw new Error(`generation_jobs query failed: HTTP ${response.status}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function executeGenerationJob(job) {
  const message = { schemaVersion: 1, jobId: job.id, runId: job.run_id };
  try {
    const response = await fetch(`${CONFIG.internalOrigin}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [INTERNAL_WORKER_SECRET_HEADER]: CONFIG.workerSecret,
        "x-finfold-queue-attempt": String((job.attempt_count ?? 0) + 1)
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(CONFIG.jobTimeoutMs)
    });
    const body = await readBounded(response);
    const outcome = parseWorkerOutcome(body);
    if (!response.ok || !outcome) {
      // 行仍是 pending（claim 未发生或路由要求重投），下一轮 sweep 自然重取；
      // 内存冷却避免对同一行热循环。
      jobCooldownUntil.set(job.id, Date.now() + CONFIG.failureCooldownMs);
      logError("generation_job_invalid_response", {
        job_id: job.id,
        status: response.status
      });
      return;
    }
    // retry/succeeded/... 的后续调度全部由数据库状态机完成（路由内部已调用
    // retry_generation_job / finish_generation_job），这里无需补动作。
    log("generation_job_completed", {
      job_id: job.id,
      outcome: outcome.status
    });
  } catch (error) {
    jobCooldownUntil.set(job.id, Date.now() + CONFIG.failureCooldownMs);
    logError("generation_job_execution_error", {
      job_id: job.id,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function sweepGenerationOutbox() {
  const freeSlots = CONFIG.concurrency - inFlightJobs.size;
  if (freeSlots <= 0) return;
  const now = Date.now();
  let jobs;
  try {
    jobs = await fetchPendingJobs(freeSlots * 2);
  } catch (error) {
    logError("generation_outbox_query_failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return;
  }
  for (const job of jobs) {
    if (inFlightJobs.size >= CONFIG.concurrency) break;
    if (inFlightJobs.has(job.id)) continue;
    const cooldown = jobCooldownUntil.get(job.id);
    if (cooldown && cooldown > now) continue;
    if (cooldown && cooldown <= now) jobCooldownUntil.delete(job.id);
    inFlightJobs.add(job.id);
    executeGenerationJob(job).finally(() => {
      inFlightJobs.delete(job.id);
    });
  }
}

// ---------------------------------------------------------------------------
// 定时任务
// ---------------------------------------------------------------------------

async function cancelBody(response) {
  try {
    await response?.body?.cancel();
  } catch {
    // 响应体可能已被消费；清理失败不能变成第二个错误。
  }
}

/** 主 Worker 内部路由：x-finfold-internal-worker-secret 头鉴权。 */
async function callInternalRoute(path, body, cron) {
  try {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), CONFIG.routeTimeoutMs);
    let response;
    try {
      response = await fetch(`${CONFIG.internalOrigin}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_WORKER_SECRET_HEADER]: CONFIG.workerSecret
        },
        body: JSON.stringify(body ?? {}),
        signal: abort.signal
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      logError("scheduled_route_failed", { path, cron, status: response.status });
      await cancelBody(response);
      return;
    }
    await cancelBody(response);
  } catch (error) {
    logError("scheduled_route_exception", {
      path,
      cron,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/** watch-poller 任务：Authorization: Bearer 鉴权（对应 runAppJob 契约）。 */
async function callPollerRoute(path, secret, cron) {
  try {
    const response = await fetch(`${CONFIG.internalOrigin}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(CONFIG.routeTimeoutMs)
    });
    if (!response.ok) {
      logError("poller_route_failed", { path, cron, status: response.status });
    }
    await cancelBody(response);
  } catch (error) {
    logError("poller_route_exception", {
      path,
      cron,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/** 主 Worker cron 语义（runWorkerSchedule）：按 cron 组合内部路由。 */
function mainWorkerRoutesForCron(cron) {
  const routes = [];
  const isDailyBundle = cron === "17 2 * * *";
  const xPipelinePhase =
    cron === "0 0 * * *"
      ? "generation"
      : cron === "30 12 * * *"
        ? "engagement"
        : null;

  routes.push(["/api/internal/generation/dispatch", {}]);
  if (CONFIG.features.signalDiscovery) {
    routes.push(["/api/internal/signals/process", {}]);
  }
  if (CONFIG.features.xPublishing) {
    routes.push(["/api/internal/x/publications/dispatch", {}]);
  }
  if (CONFIG.features.wechatPublishing) {
    routes.push(["/api/internal/wechat/publications/dispatch", {}]);
  }
  if (isDailyBundle) {
    routes.push(["/api/internal/credits/reconcile", {}]);
    routes.push(["/api/internal/extension/cleanup", {}]);
  }
  if (xPipelinePhase && CONFIG.features.xPipeline) {
    routes.push(["/api/internal/x/pipeline/run", { phase: xPipelinePhase }]);
  }
  return routes;
}

/** watch-poller cron 语义（jobsForSchedule）；staging_readiness 不适用国内站。 */
function pollerJobsForCron(cron, date) {
  if (!CONFIG.cronWatchSecret && !CONFIG.cronPerfSecret) return [];
  const jobs = [];
  const hour = date.getUTCHours();
  if (cron === "30 * * * *") {
    if (CONFIG.cronWatchSecret) jobs.push(["/api/internal/trends/sync", CONFIG.cronWatchSecret]);
    if (CONFIG.cronPerfSecret && hour % 3 === 0) {
      jobs.push(["/api/performance/poll", CONFIG.cronPerfSecret]);
    }
  } else if (cron === "0 * * * *") {
    if (CONFIG.cronWatchSecret) jobs.push(["/api/internal/trends/sync", CONFIG.cronWatchSecret]);
    if (CONFIG.cronPerfSecret && hour === 1) {
      jobs.push(["/api/operations/demand-signals", CONFIG.cronPerfSecret]);
    }
  } else if (cron === "15 1 * * *" && CONFIG.cronPerfSecret) {
    jobs.push(["/api/agent/patrol", CONFIG.cronPerfSecret]);
  } else if (cron === "0 4 * * 1" && CONFIG.cronPerfSecret) {
    jobs.push(["/api/performance/distill", CONFIG.cronPerfSecret]);
  }
  return jobs;
}

// 与 wrangler.toml [triggers] 及 workers/watch-poller/wrangler.toml 的
// UTC cron 汇总。支持的分语法：* / 单值 / 逗号列表 / */N（小时）。
const CRON_SPECS = [
  "* * * * *",
  "17 2 * * *",
  "0 0 * * *",
  "30 12 * * *",
  "0 * * * *",
  "30 * * * *",
  "15 1 * * *",
  "0 4 * * 1"
];

function matchCronField(field, value) {
  if (field === "*") return true;
  if (field.startsWith("*/")) {
    const step = Number.parseInt(field.slice(2), 10);
    return Number.isFinite(step) && step > 0 && value % step === 0;
  }
  if (field.includes(",")) {
    return field.split(",").some((part) => Number.parseInt(part, 10) === value);
  }
  return Number.parseInt(field, 10) === value;
}

function cronMatches(spec, date) {
  const [minute, hour, dom, month, dow] = spec.split(" ");
  return (
    matchCronField(minute, date.getUTCMinutes()) &&
    matchCronField(hour, date.getUTCHours()) &&
    (dom === "*") &&
    (month === "*") &&
    (dow === "*" || matchCronField(dow, date.getUTCDay()))
  );
}

const firedMinuteKeys = new Set();

async function runCronTick() {
  const now = new Date();
  const minuteKey = now.toISOString().slice(0, 16);
  for (const cron of CRON_SPECS) {
    const key = `${minuteKey}|${cron}`;
    if (firedMinuteKeys.has(key)) continue;
    if (!cronMatches(cron, now)) continue;
    firedMinuteKeys.add(key);
    if (firedMinuteKeys.size > 10_000) firedMinuteKeys.clear();

    const mainRoutes = mainWorkerRoutesForCron(cron);
    const pollerRoutes = pollerJobsForCron(cron, now);
    if (mainRoutes.length + pollerRoutes.length === 0) continue;
    log("scheduled_tick", { cron, main_routes: mainRoutes.length, poller_routes: pollerRoutes.length });
    await Promise.all([
      ...mainRoutes.map(([path, body]) => callInternalRoute(path, body, cron)),
      ...pollerRoutes.map(([path, secret]) => callPollerRoute(path, secret, cron))
    ]);
  }
}

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------

let stopping = false;

async function main() {
  log("scheduler_started", {
    internal_origin: CONFIG.internalOrigin,
    concurrency: CONFIG.concurrency,
    sweep_interval_ms: CONFIG.sweepIntervalMs,
    features: CONFIG.features,
    poller_secrets: {
      watch: Boolean(CONFIG.cronWatchSecret),
      perf: Boolean(CONFIG.cronPerfSecret)
    }
  });

  const sweep = setInterval(() => {
    if (stopping) return;
    sweepGenerationOutbox().catch((error) => {
      logError("generation_sweep_unexpected", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }, CONFIG.sweepIntervalMs);

  const cron = setInterval(() => {
    if (stopping) return;
    runCronTick().catch((error) => {
      logError("cron_tick_unexpected", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }, 10_000);

  // 启动后立刻对齐一次 cron 窗口，避免错过启动那一分钟。
  runCronTick().catch(() => {});

  await new Promise((resolve) => {
    const shutdown = () => {
      if (stopping) return;
      stopping = true;
      log("scheduler_stopping", { in_flight: inFlightJobs.size });
      clearInterval(sweep);
      clearInterval(cron);
      // 给进行中的生成任务 90s 收尾；之后由数据库租约回收。
      setTimeout(resolve, 90_000);
      if (inFlightJobs.size === 0) resolve();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

  log("scheduler_stopped");
}

main().catch((error) => {
  logError("scheduler_fatal", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
