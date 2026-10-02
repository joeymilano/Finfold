# finfold-watch-poller

A minimal, standalone Cloudflare Worker that keeps scheduled work isolated
from the main web Worker. It runs six lightweight jobs through three Cloudflare
Cron Triggers, sharing the hourly `0,15 * * * *` trigger for exact UTC
cadences and a smaller operational surface:

- **Every 30 minutes** — Opportunity Radar collection. Calls
  `POST /api/internal/trends/sync`; the main app fetches Google Trends,
  Hacker News, eligible user RSS sources, and any explicitly authorized
  optional adapter. Collection, clustering, lifecycle calculation, and
  ranking are deterministic and do not invoke an AI provider. A failing
  source is reported independently and does not cancel the remaining sync.

- **Every 6h at minute 00 UTC** — update monitoring. Asks Supabase which
  `watch_sources` are enabled, then calls
  `POST /api/watch-sources/[id]/check` on the main app for each one (feed
  parsing, drafting a kit, plan gating all live in that route).
- **`30 */3 * * *`** (every 3h, offset by 30min) — performance polling.
  Calls `POST /api/performance/poll` once; that route itself queries
  Supabase for every Reddit/Hacker News/Product Hunt output with a
  `published_url` and refreshes likes/comments from each platform's public
  data — no per-item work happens on the Worker side for this job.
- **Every Monday at 04:00 UTC** — negative-learning review.
  Calls `POST /api/performance/distill` so the main app can turn
  repeatedly weak patterns into explicit rules for future generations.
- **Daily at 01:15 UTC** — Agent duty patrol. Calls
  `POST /api/agent/patrol`; the main app reviews each eligible Digital
  Employee account and keeps exactly one highest-priority open action in its
  duty queue. This job can discover, rank, and remind only — it never
  publishes content or mutates brand assets.
- **Daily at 02:00, 10:00, and 18:00 UTC** — Staging readiness. Runs two
  independent read-only probes: one directly against the isolated staging
  PostgREST endpoint and one against `GET /api/health/ready` on the Staging
  app. The direct database probe preserves legitimate staging activity even
  when the full app is cold or unhealthy. Failures are logged separately; no
  LLM, content generation, publishing, or product data mutation is involved.

All the real logic lives in the Next.js app — this Worker is deliberately
as thin as possible.

## One-time setup

1. **Generate two shared secrets** (shared across the six scheduled jobs) and set each in both
   places:
   ```bash
   openssl rand -hex 32
   ```
   - Add them as `CRON_WATCH_SECRET` and `CRON_PERF_SECRET` in the main
     Finfold Worker's encrypted secrets (Cloudflare dashboard → Workers &
     Pages → finfold-app → Settings → Variables and Secrets).
   - Set the same values as secrets on this Worker (see step 3).

2. **Install dependencies** in this directory:
   ```bash
   cd workers/watch-poller
   npm install
   ```

3. **Set Worker secrets** (values, not committed to any file):
   ```bash
   wrangler secret put CRON_WATCH_SECRET
   wrangler secret put CRON_PERF_SECRET
   wrangler secret put NEXT_PUBLIC_SUPABASE_URL
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
   `workers/watch-poller/wrangler.toml` declares all four names in
   `[secrets].required` for type generation and local-development warnings.
   Remote presence is enforced by the repository deploy gate.
   The Supabase URL/key match the main app's own Supabase project — this
   Worker only ever does one read-only query (`SELECT id FROM watch_sources
   WHERE enabled = true`) to know what to poll for job 1; the remaining jobs
   need no direct Supabase access because their Next.js routes do their own
   querying.

4. **Check `wrangler.toml`** — `FINFOLD_APP_URL` should point at the
   production Finfold deployment, `FINFOLD_STAGING_URL` at the isolated
   Staging Worker, and `STAGING_SUPABASE_URL` / `STAGING_SUPABASE_ANON_KEY`
   at the same isolated database. These last two are public browser-safe
   values; RLS remains the data boundary. If a multiplexed job cadence changes,
   update both `jobsForSchedule()` and its schedule tests.

5. **(Optional) Product Hunt polling** — set `PRODUCT_HUNT_API_TOKEN` on
   the main Finfold Worker (not this Worker) to enable polling
   Product Hunt vote/comment counts. Get a read-only "test token" at
   https://www.producthunt.com/v2/oauth/applications — no per-user OAuth
   needed. Without it, Product Hunt outputs are simply skipped; Reddit and
   Hacker News poll with no token at all.

6. **Deploy** (the npm pre-script runs the remote secret gate first):
   ```bash
   npm run deploy
   ```

   From the repository root, the equivalent command is
   `npm run deploy:poller`.

## Verifying it's working

- `wrangler tail` while triggering a manual run (Cloudflare dashboard →
  Workers → finfold-watch-poller → Triggers → "Trigger cron" for testing —
  pick which schedule to fire) should show one of:
  - `[watch-poller] checking N watch source(s)` followed by one
    `[watch-poller] source=<id> status=200 body=...` line per source.
  - `[perf-poller] status=200 body={"polled":N,"updated":N,"skipped":N}`.
  - `[negative-distill] status=200 body=...`.
  - `[agent-patrol] status=200 body={"scanned":N,"eligible":N,...}`.
  - `[trend-sync] status=200 body={"collected":N,"persisted":N,...}`.
- A successful draft returns `{"drafted": true, "kitId": "...", "entryTitle": "..."}`
  from the main app; `{"drafted": false, "reason": "..."}` covers the normal
  no-op cases (no new entry since last check, source disabled, plan
  downgraded below Digital Employee, fetch failed).
- Performance polling only touches outputs owned by Digital Employee plan
  users with a `published_url` on Reddit/Hacker News/Product Hunt — an
  empty `{"polled":0,...}` response is normal if no such output exists yet.
- Agent patrol only stores a recommendation for an eligible account. The
  visible action still requires the user to confirm publishing, experiment
  creation, or brand changes inside the main app.

## Why this remains a separate Worker

The main application now also runs on Workers, so the schedules could
technically be merged. Keeping this poller separate reduces the blast radius
of scheduled failures, gives cron jobs their own logs and resource accounting,
and avoids coupling web releases to schedule changes. It has no state of its
own; if it goes down, automatic polling pauses while the interactive product
continues to run.
