/**
 * Standalone Cloudflare Worker — its primary job is to wake up on a cron
 * schedule and call back into the main Finfold app, which holds all the
 * actual logic. The only public request surface is a read-only /health
 * endpoint; it never runs a job or reads a credential. Keeping the schedule
 * separate isolates cron failures and releases from interactive web traffic.
 *
 * Seven related scheduled jobs share this Worker (rather than each getting its own)
 * since all seven are the same shape — "wake up periodically, call one URL
 * back into the app" — and more near-empty Workers would just be more
 * infra to deploy and monitor for no benefit:
 *
 *   1. Update-monitoring: lists enabled watch_sources from Supabase, then
 *      calls POST /api/watch-sources/[id]/check for each one (feed parsing
 *      + auto-drafting lives in that route).
 *   2. Performance polling: calls POST /api/performance/poll once; that
 *      route itself queries Supabase for every pollable output (Reddit/
 *      Hacker News/Product Hunt posts with a published_url) and updates
 *      their metrics — no per-item looping needed on the Worker side.
 *   3. Performance learning: calls POST /api/performance/distill once a week.
 *      Its deterministic visual-preference analysis runs under the zero-cost
 *      policy; LLM-based negative-rule distillation remains disabled unless
 *      the owner approves an autonomous AI budget.
 *   4. Agent patrol: calls POST /api/agent/patrol every morning; that route
 *      checks eligible users' mission/content state and persists exactly one
 *      next action without publishing or starting experiments for them.
 *   5. Staging readiness: calls GET /api/health/ready three times a day. The
 *      poller also queries the staging PostgREST endpoint directly with the
 *      public anon key. The direct database probe is the keep-alive path; the
 *      app endpoint remains a separate availability signal and cannot prevent
 *      database activity when the staging app is cold or unhealthy.
 *   6. Public demand research: calls POST /api/operations/demand-signals once
 *      per day. The app checks active operating-program keywords against the
 *      official Hacker News API and persists only deduplicated, unverified
 *      signals for plans with background monitoring.
 *   7. Opportunity Radar: calls POST /api/internal/trends/sync every 30
 *      minutes. Collection and scoring are deterministic and never invoke an
 *      AI provider; each source fails independently inside the main app.
 *
 * Secrets required (set via `wrangler secret put <NAME>` in this
 * directory):
 *   CRON_WATCH_SECRET       — shared secret for job 1; must match the main
 *                             Worker's CRON_WATCH_SECRET env var exactly.
 *   CRON_PERF_SECRET        — shared secret for jobs 2, 3 and 4; must match
 *                             the main Worker's CRON_PERF_SECRET env var
 *                             exactly.
 *   SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL — read-only listing
 *                             of enabled watch source ids (needed because
 *                             this Worker has no Next.js/Supabase client
 *                             session; it queries Supabase directly with
 *                             the service-role key for this one read).
 */

export interface Env {
  FINFOLD_APP_URL: string;
  FINFOLD_STAGING_URL: string;
  STAGING_SUPABASE_URL: string;
  STAGING_SUPABASE_ANON_KEY: string;
  CRON_WATCH_SECRET: string;
  CRON_PERF_SECRET: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

type ScheduledEvent = {
  readonly cron: string;
  readonly scheduledTime: number;
};

type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type ScheduledWorkerHandler<Bindings> = {
  scheduled(
    event: ScheduledEvent,
    env: Bindings,
    ctx: ExecutionContext
  ): Promise<void>;
};

type FetchWorkerHandler<Bindings> = {
  fetch(
    request: Request,
    env: Bindings,
    ctx: ExecutionContext
  ): Response | Promise<Response>;
};

type WatchSourceRow = { id: string };
const MAX_SUPABASE_RESPONSE_BYTES = 1024 * 1024;
const MULTIPLEXED_HOURLY_CRON = "0,15 * * * *";
const TREND_HALF_HOUR_CRON = "30 * * * *";
const PERFORMANCE_CRON = "30 */3 * * *";
const AUTONOMOUS_AI_CALLS_DISABLED = true;
const HEALTH_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
} as const;

export function handlePollerRequest(request: Request): Response {
  const { pathname } = new URL(request.url);

  if (pathname !== "/health") {
    return jsonResponse({ error: "Not found." }, 404);
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse(
      { error: "Method not allowed." },
      405,
      { Allow: "GET, HEAD" }
    );
  }

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers: HEALTH_HEADERS });
  }

  return jsonResponse({
    status: "ready",
    service: "finfold-watch-poller",
    scope: "worker-only",
    mode: "scheduled",
    schedules: [MULTIPLEXED_HOURLY_CRON, TREND_HALF_HOUR_CRON, PERFORMANCE_CRON]
  });
}

function jsonResponse(
  body: object,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...HEALTH_HEADERS, ...extraHeaders }
  });
}

export type PollerJob =
  | "watch_sources"
  | "performance_poll"
  | "performance_learning"
  | "negative_rule_distill"
  | "agent_patrol"
  | "public_demand_refresh"
  | "trend_sync"
  | "staging_readiness";

/**
 * Preserve the existing Cron topology while blocking unattended model calls
 * under the zero-new-cost policy. Performance polling and the Agent patrol do
 * not invoke providers; watch drafting and negative-rule distillation remain
 * disabled until a human approves an autonomous AI budget.
 */
export function jobsForSchedule(
  event: Pick<ScheduledEvent, "cron" | "scheduledTime">
): PollerJob[] {
  if (event.cron === TREND_HALF_HOUR_CRON) return ["trend_sync"];
  if (event.cron === PERFORMANCE_CRON) return ["performance_poll"];
  if (event.cron !== MULTIPLEXED_HOURLY_CRON) return [];

  const scheduledAt = new Date(event.scheduledTime);
  const minute = scheduledAt.getUTCMinutes();
  const hour = scheduledAt.getUTCHours();
  const weekday = scheduledAt.getUTCDay();
  const jobs: PollerJob[] = [];

  if (minute === 0) jobs.push("trend_sync");

  if (!AUTONOMOUS_AI_CALLS_DISABLED && minute === 0 && hour % 6 === 0) {
    jobs.push("watch_sources");
  }
  if (minute === 0 && hour === 4 && weekday === 1) {
    jobs.push(AUTONOMOUS_AI_CALLS_DISABLED ? "performance_learning" : "negative_rule_distill");
  }
  if (minute === 0 && hour === 1) jobs.push("public_demand_refresh");
  if (minute === 0 && [2, 10, 18].includes(hour)) jobs.push("staging_readiness");
  if (minute === 15 && hour === 1) jobs.push("agent_patrol");

  return jobs;
}

async function listEnabledWatchSourceIds(env: Env): Promise<string[]> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/watch_sources?select=id&enabled=eq.true`;
  try {
    const response = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "X-Request-Id": requestId
      },
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      log("error", "watch_sources_list_failed", {
        request_id: requestId,
        status: response.status,
        latency_ms: Date.now() - startedAt
      });
      return [];
    }

    const rows = parseWatchSourceRows(
      await readTextWithLimit(response, MAX_SUPABASE_RESPONSE_BYTES)
    );
    log("info", "watch_sources_list_completed", {
      request_id: requestId,
      source_count: rows.length,
      latency_ms: Date.now() - startedAt
    });
    return rows.map((row) => row.id);
  } catch (error) {
    log("error", "watch_sources_list_failed", {
      request_id: requestId,
      error_type: errorType(error),
      latency_ms: Date.now() - startedAt
    });
    return [];
  }
}

async function checkOne(env: Env, id: string): Promise<void> {
  await runAppJob(
    env,
    "watch_source_check",
    `/api/watch-sources/${id}/check`,
    env.CRON_WATCH_SECRET,
    { source_id: id }
  );
}

async function checkAll(env: Env): Promise<void> {
  const ids = await listEnabledWatchSourceIds(env);
  log("info", "watch_source_sweep_started", { source_count: ids.length });

  // Sequential, not parallel — each check can trigger an LLM generation
  // call when there's a new entry, and this Worker has no reason to hammer
  // the main app with a burst of concurrent generation requests.
  for (const id of ids) {
    await checkOne(env, id);
  }
}

async function pollPerformance(env: Env): Promise<void> {
  await runAppJob(
    env,
    "performance_poll",
    "/api/performance/poll",
    env.CRON_PERF_SECRET
  );
}

async function learnFromPerformance(env: Env, job: "performance_learning" | "negative_rule_distill"): Promise<void> {
  await runAppJob(
    env,
    job,
    "/api/performance/distill",
    env.CRON_PERF_SECRET
  );
}

async function runAgentPatrol(env: Env): Promise<void> {
  await runAppJob(
    env,
    "agent_patrol",
    "/api/agent/patrol",
    env.CRON_PERF_SECRET
  );
}

async function refreshPublicDemandSignals(env: Env): Promise<void> {
  await runAppJob(
    env,
    "public_demand_refresh",
    "/api/operations/demand-signals",
    env.CRON_PERF_SECRET
  );
}

async function syncOpportunityRadar(env: Env): Promise<void> {
  await runAppJob(
    env,
    "trend_sync",
    "/api/internal/trends/sync",
    env.CRON_WATCH_SECRET
  );
}

export async function runStagingReadiness(env: Env): Promise<void> {
  const results = await Promise.all([
    probeStagingDatabase(env),
    probeStagingApp(env)
  ]);
  if (results.some((result) => !result)) {
    throw new Error("One or more staging readiness probes failed.");
  }
}

async function probeStagingDatabase(env: Env): Promise<boolean> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  try {
    const response = await fetch(
      new URL("/rest/v1/profiles?select=id&limit=1", env.STAGING_SUPABASE_URL),
      {
        method: "GET",
        headers: {
          apikey: env.STAGING_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.STAGING_SUPABASE_ANON_KEY}`,
          "X-Client-Info": "finfold-staging-readiness"
        },
        signal: AbortSignal.timeout(15_000)
      }
    );
    log(response.ok ? "info" : "error", "staging_database_readiness_completed", {
      job: "staging_readiness",
      request_id: requestId,
      status: response.status,
      ok: response.ok,
      latency_ms: Date.now() - startedAt
    });
    await response.body?.cancel().catch(() => undefined);
    return response.ok;
  } catch (error) {
    log("error", "staging_database_readiness_failed", {
      job: "staging_readiness",
      request_id: requestId,
      error_type: errorType(error),
      latency_ms: Date.now() - startedAt
    });
    return false;
  }
}

async function probeStagingApp(env: Env): Promise<boolean> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  try {
    const response = await fetch(
      new URL("/api/health/ready", env.FINFOLD_STAGING_URL),
      {
        method: "GET",
        headers: { "X-Request-Id": requestId },
        signal: AbortSignal.timeout(15_000)
      }
    );
    log(response.ok ? "info" : "error", "staging_app_readiness_completed", {
      job: "staging_readiness",
      request_id: requestId,
      status: response.status,
      ok: response.ok,
      latency_ms: Date.now() - startedAt
    });
    await response.body?.cancel().catch(() => undefined);
    return response.ok;
  } catch (error) {
    log("error", "staging_app_readiness_failed", {
      job: "staging_readiness",
      request_id: requestId,
      error_type: errorType(error),
      latency_ms: Date.now() - startedAt
    });
    return false;
  }
}

async function runAppJob(
  env: Env,
  job: string,
  path: string,
  secret: string,
  fields: Record<string, string | number> = {}
): Promise<void> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  try {
    const response = await fetch(`${env.FINFOLD_APP_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Request-Id": requestId
      },
      signal: AbortSignal.timeout(60_000)
    });
    log(response.ok ? "info" : "error", "scheduled_job_completed", {
      job,
      request_id: requestId,
      status: response.status,
      ok: response.ok,
      latency_ms: Date.now() - startedAt,
      ...fields
    });
    await response.body?.cancel().catch(() => undefined);
  } catch (error) {
    log("error", "scheduled_job_failed", {
      job,
      request_id: requestId,
      error_type: errorType(error),
      latency_ms: Date.now() - startedAt,
      ...fields
    });
  }
}

function parseWatchSourceRows(raw: string): WatchSourceRow[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Invalid watch source response.");
  return parsed.filter(
    (row): row is WatchSourceRow =>
      Boolean(
        row &&
          typeof row === "object" &&
          "id" in row &&
          typeof row.id === "string" &&
          /^[0-9a-f-]{36}$/i.test(row.id)
      )
  );
}

async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes) throw new Error("Response too large.");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Response too large.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function errorType(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
  if (error instanceof SyntaxError) return "invalid_json";
  if (error instanceof Error) return error.name || "error";
  return "unknown";
}

function log(
  level: "info" | "error",
  event: string,
  fields: Record<string, string | number | boolean>
): void {
  const record = {
    timestamp: new Date().toISOString(),
    service: "finfold-watch-poller",
    level,
    event,
    ...fields
  };
  if (level === "error") console.error(record);
  else console.log(record);
}

export default {
  fetch(request: Request, _env: Env, _ctx: ExecutionContext): Response {
    return handlePollerRequest(request);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const jobs = jobsForSchedule(event).map((job) => {
      if (job === "watch_sources") return checkAll(env);
      if (job === "performance_poll") return pollPerformance(env);
      if (job === "trend_sync") return syncOpportunityRadar(env);
      if (job === "performance_learning" || job === "negative_rule_distill") return learnFromPerformance(env, job);
      if (job === "public_demand_refresh") return refreshPublicDemandSignals(env);
      if (job === "staging_readiness") return runStagingReadiness(env);
      return runAgentPatrol(env);
    });

    if (jobs.length > 0) ctx.waitUntil(Promise.all(jobs).then(() => undefined));
  }
} satisfies ScheduledWorkerHandler<Env> & FetchWorkerHandler<Env>;
