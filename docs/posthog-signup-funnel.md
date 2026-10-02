# Finfold PostHog signup funnel contract

This document is the source of truth for the public-acquisition signup funnel.
Historical AI reports that treated every `marketing_cta_clicked` event as an
account-health signup are not valid because CTA destinations differ.

## Canonical production funnel

Use an ordered 14-day funnel with these steps:

1. `landing_view`
2. `marketing_cta_clicked`, filtered to `destination = signup`
3. `signup_page_viewed`
4. `signup_started`
5. `signup_completed`
6. `signup_destination_reached`, with `destination_matches = true`

Apply `traffic_class = production` to every step. Internal validation visits
must use a recognized QA UTM marker and arrive with `traffic_class = qa` and
`is_test_traffic = true`.

`landing_view` covers every public search-entry surface: the localized home,
tools index, blog index, use-cases index, and each tool, article, or use-case
detail page. Index-page events use the existing `contentType`, `locale`, and
`path` properties so organic entries are not omitted from the first funnel step.

When email confirmation is required, the signup UI holds repeat submissions for
60 seconds. The first accepted request emits `signup_confirmation_required`;
an intentional request after the cooldown emits `signup_confirmation_resent`
instead of recording another `signup_account_created` event.

## CTA event properties

Every public conversion CTA uses `marketing_cta_clicked` and includes:

- `cta_id`: stable identifier for the exact control;
- `source_type`: page or global-surface category;
- `source_slug`: content slug when applicable;
- `source_surface`: header, hero, content, account-health, or closing surface;
- `destination`: `signup`, `dashboard`, `workbench_preview`, or another explicit target;
- `locale` and, when known, `audience_state`.

Do not infer signup intent from the event name alone. Always filter the
`destination` property.

## Signup handoff

`signup_flow_id` is created only after a visitor interacts with a signup
method. The validated identifier and `traffic_class` travel through the OAuth
or email-confirmation callback and are attached to server-side
`signup_completed`. The same flow identifier is retained until the requested
product destination emits `signup_destination_reached`.

The flow identifier contains no email, credential, provider token, or other
personal data. Invalid identifiers and traffic classifications are dropped at
the server boundary.

## First task activation (September 2026)

The home hero now enters `/workbench?start=1` with
`destination=workbench_preview`, not `destination=signup`. Keep the historical
signup report as a registration diagnostic; do not treat its first step as the
new activation funnel, and do not rewrite historical events.

Use the new first-task query:
`first_task_viewed` → `first_task_input_ready` → `kit_generation_started` →
`kit_generation_completed` → `content_result_used` (14-day ordered window).
The last two steps must be joined by `kit_id`; starts and completions can be
joined by `generationRequestId`. For multiple attempts by one person, group by
`first_task_id` then distinct `generationRunId` to avoid cross-task conversion.
The saved visual funnel is a person-level overview, not an attempt success rate.
It excludes the entire person identity when QA or loopback traffic appears in
the last 90 days; unmarked internal accounts remain unknown. The final step
requires a first_task_id. Keep this lookback consistent when comparing periods.

- `analytics_version=2` identifies repaired generation/usage events. Before this
  change, queue completion, queue failure, and recovered presentation were
  missing; never compare raw success rates across this boundary.
- `kit_generation_completed/failed/cancelled` come from persisted server run
  states, including worker retries and owner-scoped recovery reads. Partial
  success retains `status=partial_success`; it is not full two-platform success.
- Identical event UUIDs, original persisted timestamps, names and user identities
  support eventual PostHog deduplication. Queries must still dedupe
  `generationRunId`, as ingestion/deduplication is not an exactly-once guarantee.
  No recurring delivery worker/outbox is added: a network outage with no later
  retry/recovery can still lose a capture. `generation_runs` stays authoritative.
- `first_kit` browser capture is retired. Derive first durable completion with
  the minimum completion timestamp per user; do not use a client cache length
  as proof of the user's first-ever result.
- `output_first_visible` is a persisted-kit presentation event, independent of
  loading state. It can repeat on remount; dedupe by person + kit. It no longer
  measures the first streaming token, nor implies the user copied anything.
- `content_result_used` fires after copy/copy-all or download dispatch, with
  `kit_id`, `method` and optional opaque `first_task_id`. Downloads mean browser
  dispatch, not a verified saved file or external publication.
- Client transport problems use `generation_client_error/interrupted` so a
  dropped browser stream cannot count as server failure or cancellation.
- Queue payloads preserve the small, validated analytics context. It never
  authorizes paid tools, changes billing, or contains the input text. Old/API
  calls without context are `unknown`, not automatically production.
- Localhost/loopback and explicit QA attribution are excluded consistently from
  automatic pageviews/clicks and custom events. At analysis time also exclude
  people known to have QA/local traffic; unknown internal accounts cannot be
  inferred automatically. Do not require production tags on legacy payment
  events because server payments historically omitted them.

Email resend uses Supabase `auth.resend` instead of a new signup request.
Successful confirmation and provider-rate-limit cooldowns survive page reload
for the same address; passwords are never persisted. The API preserves the
return target and returns stable error codes plus Retry-After. This does not
increase upstream SMTP quotas: current custom-SMTP settings, supplier delivery
logs, and the project hourly cap still need account-side verification.

First-task drafts are stored only in this browser for up to seven days. The
OAuth/email return URL contains an opaque draft ID, never the source text.
Generation stays authenticated and explicit after return. A new free account's
50 Credits cover the two-platform copy-only cost of 18; copies/downloads are
available on the free plan. No new paid entitlement or anonymous generation
endpoint is added. A different browser/device cannot restore this local draft.

## First-task input follow-up (September 22, 2026; local, not released)

`first_task_ui_version=2` marks the input-guidance change on first-task views
and input events. `first_task_input_started` records the first non-empty edit
per mounted entry; it contains only the opaque task ID and UI version, never
source text. It is a diagnostic event, not a new step in the saved funnel.

`first_task_input_ready` now also fires after restoring an eligible unfinished
draft, after `first_task_viewed`, and has `input_source=restored|edited|submit`.
It fires at most once per mounted entry. Dedupe by person + first_task_id for
task analysis. Pending/completed restores do not fabricate new input readiness.
Compare new, non-restored entries separately: an increase caused by this
measurement repair is not evidence of improved conversion. Existing signup
and first-task saved reports and historical events are unchanged.
