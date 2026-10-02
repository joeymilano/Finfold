> Current rollout decision (2026-09-08): the user removed the gray-release requirement.
> Open discovery to all accounts with the existing feature entitlement by leaving
> `SIGNAL_DISCOVERY_USER_IDS` empty. Preserve daily/monthly cost limits.
> The 72-hour review is post-release monitoring, not an activation prerequisite.
> Earlier gray-release instructions below are historical and superseded.

# Signal discovery upgrade — 2026-09-08

## Approved outcome

Discover evidence-backed demand, content opportunities, competitor changes and
industry developments for each user's business. Reuse existing resources, prefer
free feeds/public APIs, and never automatically purchase or enable paid platform
data. Chinese and overseas sources share a bounded workload, not a budget per site.

## Source coverage

- Default free collection: existing feeds plus 人人都是产品经理, 阮一峰周刊,
  OSCHINA, IT之家, n8n feature requests and Postiz GitHub issues.
- Deepen existing Hacker News coverage with Ask HN and Show HN.
- Business-directed indexed discovery targets Baidu/public web, Xiaohongshu,
  Bilibili, WeChat articles, Weibo, X, LinkedIn and Reddit. Indexed discovery is
  distinct from full platform search and direct article evidence.
- Reuse competitor keywords from business profiles; dedicated release-page diff monitoring remains a follow-up.
- V2EX, 36Kr, Bluesky, YouTube, Stack Exchange, Hugging Face and government
  procurement/policy sources remain documented candidates until their individual
  access/credentials and business fit are verified. Do not claim these as enabled.

## Implementation and defaults

1. Repair Google Trends IDs, source labels, and publication-vs-observation age.
2. Correct Qwen multimodal search transport and add query-first discovery without
   breaking existing URL-recovery callers. Always retain attributable sources.
3. Durable tenant-scoped jobs: profile-versioned query plans, leased incremental
   work, retry/backoff, bounded candidates and reads, persisted stage outcomes.
4. Relevance-first recall and evidence-grounded semantic assessment. Only direct
   readable evidence can create a recommended opportunity. Indexed-only material
   stays a candidate; missing metrics are never fabricated. Preserve dismissals.
5. Feed both opportunity and demand views from the same assessed evidence.
6. Expose source coverage, pending work, no matches, blocked reads and budget
   exhaustion in the existing radar. Preserve existing subscription eligibility.

Cadence: every 8 hours for eligible active programs. Manual runs share limits:
8 search-provider attempts per run, 24 per user/day, 30 candidates and at most
12 deep reads. New jobs spend one of the existing 12 analysis slots on compact
bilingual query planning. The reservation RPC enforces the model-call ceiling
separately: blocked reads do not consume an analysis, and planning never adds quota.
Retries count against quotas. Only configured search/model channels are eligible;
new paid data providers are disabled. A server-side shared monetary reservation
and daily quota must succeed before any discovery AI request is dispatched.
Never refund a dispatched request merely because its result is missing.

## Acceptance

- Unit/integration coverage: feed identity, retries, SSE attribution, scoped
  queries, URL safety, evidence excerpts, deduplication, stale timestamps,
  tenant isolation, leases, quota exhaustion and UI failure states.
- Run lint, typecheck, relevant tests and the production build sequentially where
  required. Keep live probe results separate from mocked regression tests.
- Live sample benchmark: Finfold creator/small-team workflows and competitors;
  curated 20-item reference set, >=70% recall within the accessible reference
  scope and >=80% useful items in the first 10. Record each platform separately.
- Rollout: migration + internal gray release, 72-hour source/quality/cost review,
  then wider activation. No claim of full production acceptance before this.

## Baseline (read-only production inspection)

330 collection runs over the preceding seven days; 814 active opportunities,
maximum match score 21 against threshold 70. Google Trends reported 10 collected
but 1 persisted per successful run, with the feed URL reused as item identity.
Native RSS probes succeeded for woshipm, ruanyifeng, OSCHINA, IT之家 and n8n;
Postiz public GitHub issues were readable. V2EX/Bluesky probes failed and 36Kr
returned HTML rather than a feed. These are point-in-time probes, not an SLA.

## Local implementation and verification status

Implemented in the workspace, including source readers, discovery jobs, the shared
quota RPC, evidence qualification, both UI projections, and explicit source failure
states. Migration 103 has now been applied through the existing authenticated Supabase
SQL console and independently checked through the application connection. The
release config enables only the existing internal employee account. Deployment is
active; live quality findings and remaining acceptance steps are recorded in the
production pilot report linked below.

Verified on 2026-09-08:

- Full regression run: 342 test files / 1,872 assertions passed; opt-in live tests
  were skipped in that run. Additional discovery route/gray-access checks were
  subsequently run separately.
- 22 isolated PostgreSQL checks passed against migrations 095, 102 and 103,
  including lease expiry, per-run/per-user quotas, shared monetary reservations,
  scheduling rotation and dismissal synchronization. The test uses PGlite;
  it does not simulate multi-process PostgreSQL lock contention or alter production.
- Final targeted rerun: 74 tests passed, including gray-account access and unknown-date labeling.
- Typecheck and lint passed (existing image-related lint warnings remain).
- Cloudflare/OpenNext production build passed. No new Cloudflare bindings, queues,
  or cron triggers were introduced; the zero-cost resource-boundary check passed.
- Real public-source probe: 8/8 source groups returned 50 total items; 24 article
  samples were checked and 19 yielded readable bodies. Five remained blocked or
  insufficient. Exact URLs, dates and excerpts are in
  `../verification/signal-free-source-probe-2026-09-08.json`.
- The live probe caught and fixed HTTP Atom permalinks turning into Google search
  links. Feeds now retain article permalinks, and search pages cannot qualify as
  original evidence. Common article/body containers are extracted before page chrome.

Not yet validated: live native-model search/assessment with the allowlisted
production credentials at quality acceptance level, 20-item independent recall benchmark, first-ten usefulness,
or the 72-hour gray period. The first deployed jobs are now recorded in
`../verification/signal-production-pilot-2026-09-08.md`. Source access success
and mocked model tests do not establish useful-signal quality.

## Activation and gray-release controls

1. Apply migration `103_signal_discovery.sql` after the existing 102 budget migration.
2. Reuse the configured `qwen-free-latest,qwen-free-snapshot` channels. The local
   development environment does not expose their key, but the existing Worker
   secret list confirms the free model key is configured. Supabase browser login
   and Wrangler OAuth were reused; no new credentials or paid data channels were created.
3. Set `SIGNAL_DISCOVERY_ENABLED=true` and `SIGNAL_DISCOVERY_USER_IDS` to explicit
   internal pilot UUIDs. An empty UUID list expands access to all eligible users;
   do not use that for the first gray period.
4. Keep the initial shared reservation limit at ¥30 and ¥0.10 per dispatched
   AI attempt, including failures. This is a conservative safety reservation,
   **not actual provider billing**; at this setting the shared ledger permits at
   most 300 attempts per month. Native public feeds do not consume that allowance.
5. Confirm a real pilot run proceeds through searches, original reads and verified
   recommendations. Record source-specific failures, actual useful items and
   provider usage. Compare against independently curated references before expanding.
6. Review for 72 hours before expanding the UUID list or changing reservation policy.
   Switch `SIGNAL_DISCOVERY_ENABLED=false` to stop the new engine; existing native
   feed collection remains available. The current release contains no paid-data
   subscription or automatic outreach.

Local SQL verification can be repeated with an isolated PGlite installation:
`SIGNAL_SQL_RUNTIME=/absolute/path/to/@electric-sql/pglite/dist/index.js node scripts/check-signal-discovery-db.mjs`.
The read-only source probe is opt-in:
`SIGNAL_LIVE_PROBE=true npm test -- --maxWorkers=1 test/signal-discovery-live.test.ts`.


## Production activation progress

- Migration 103 applied successfully in one transaction on 2026-09-08.
- Database probe passed: 102 tables / 1,171 declared columns exist. Scoped RPC
  inspection confirmed fixed search paths, anonymous execution denied and existing
  service-role execution allowed.
- Isolated production gates passed, including zero high-severity runtime dependency
  vulnerabilities and a 4.37 MiB compressed Worker estimate.
- Internal pilot job `4eadc420-f870-4730-b25e-da61d76bed5f` has been enqueued under
  the real profile and existing entitlement, without changing the account's plan.
- Record deployed version and observed model/evidence outcomes before calling the
  pilot successful. A queued job alone is not an accepted signal result.

Live activation, source failures, the timezone correction and the follow-up
procedure are maintained in `../verification/signal-production-pilot-2026-09-08.md`.

## Follow-up: business queries and original community evidence

The first live run produced two distinct content opportunities from one publisher.
The next iteration replaces long profile prose with platform-specific compact
queries, ranks candidates using bilingual business terms, and interleaves search
with assessment so the first useful article need not wait for eight searches.
Planning failure is recorded explicitly and falls back once to the original
queries; every dispatched planning attempt consumes the existing analysis budget.

For users who enable Hacker News, a planned English business topic also queries
the public HN Algolia index and reads up to four current Firebase API stories.
Only authoritative, recent, non-deleted story bodies become evidence. This step
has at most five HTTP requests, no credentials or paid model calls, and its own
leased execution step. The bounded pool reserves 10 feed, 4 native HN and up to
16 indexed candidates. Index availability is not a service guarantee.

Assessments select an index into literal original fragments; generated quotation
text is ignored. Evidence failures now distinguish schema, mismatched quotation,
unreadable body and stale/future timestamps. Multiple sources that corroborate
one opportunity are counted once. The semantic acceptance threshold stays 70.

The first production rerun correctly rejected unrelated hardware headlines but
spent its first two reads on one publisher. Subsequent read ordering discounts
a publisher by 15 retrieval points for each prior assessed/blocked/rejected read,
normalizing `www` hostnames. This spreads the limited read allowance across sources;
it neither qualifies an article nor changes model/evidence acceptance thresholds.
The 72-hour app heartbeat is active; no wider rollout has been accepted.
