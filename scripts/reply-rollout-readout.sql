-- ============================================================
-- Reply-assistant rollout readout (read-only, run manually)
--
-- Produces the five numbers the rollout / pricing decisions need:
--   1. Adoption: weekly active repliers and reply volume (28 days)
--   2. Consumption: credits burned per active replier (14 days)
--   3. Paid conversion: reply users vs engaged non-reply users,
--      plus purchases that came AFTER a user's first reply
--   4. Margin: estimated model cost vs credits burned (28 days)
--   5. Tiered-send reliability: sent/typed/copied/failed shares
--
-- Run in the Supabase SQL editor, or:
--   psql "$SUPABASE_DB_URL" -f scripts/reply-rollout-readout.sql
--
-- Decision rules for each output live in scripts/reply-rollout-readout.md.
--
-- Caveats baked into the queries — keep them when quoting numbers:
--   * Cohorts are correlational: reply users are by construction more
--     active, so treat the paid-conversion gap as an upper bound.
--   * "Paid" = current plan above free OR at least one paid credit
--     pack ever. Downgraded subscribers are undercounted.
--   * Reply rows are counted once per request; model-margin rows are
--     counted once per attempt (a repaired generation runs the model
--     twice and really does cost twice).
--   * Send outcomes exist only from 2026-09-17 onward (migration 106)
--     and only for sends by extension builds that report them.
-- ============================================================

-- 1. Weekly adoption -------------------------------------------------------
select to_char(date_trunc('week', reserved_at), 'YYYY-MM-DD') as week_start,
       count(distinct user_id) as active_repliers,
       count(*) as replies,
       round(count(*)::numeric / nullif(count(distinct user_id), 0), 1) as replies_per_replier
from public.ai_usage_operations
where source = 'chrome_extension_reply'
  and status = 'settled'
  and reserved_at >= now() - interval '28 days'
group by 1
order by 1;

-- 2. Per-replier consumption (users active in the last 14 days) -----------
with per_user as (
  select user_id, count(*) as replies, sum(cost) as credits
  from public.ai_usage_operations
  where source = 'chrome_extension_reply'
    and status = 'settled'
    and reserved_at >= now() - interval '14 days'
  group by 1
)
select count(*) as active_repliers,
       coalesce(round(avg(replies), 1), 0) as avg_replies_14d,
       coalesce(round(avg(credits), 1), 0) as avg_credits_14d,
       coalesce(max(credits), 0) as max_credits_14d,
       coalesce(percentile_cont(0.5) within group (order by credits), 0) as median_credits_14d
from per_user;

-- 3. Paid conversion: reply users vs engaged non-reply users ---------------
with reply_users as (
  select user_id
  from public.ai_usage_operations
  where source = 'chrome_extension_reply' and status = 'settled'
  group by 1
),
control_users as (
  select distinct o.user_id
  from public.ai_usage_operations o
  where o.status = 'settled'
    and o.source <> 'chrome_extension_reply'
    and o.reserved_at >= now() - interval '60 days'
    and not exists (
      select 1 from public.ai_usage_operations r
      where r.user_id = o.user_id
        and r.source = 'chrome_extension_reply'
        and r.status = 'settled'
    )
),
marked as (
  select user_id, true as used_reply from reply_users
  union all
  select user_id, false from control_users
)
select m.used_reply as is_reply_user,
       count(*) as users,
       count(*) filter (
         where p.plan is not null and p.plan <> 'free'
            or exists (
              select 1 from public.credit_purchases cp
              where cp.user_id = m.user_id and cp.status = 'paid'
            )
       ) as paid_users,
       round(100.0 * count(*) filter (
         where p.plan is not null and p.plan <> 'free'
            or exists (
              select 1 from public.credit_purchases cp
              where cp.user_id = m.user_id and cp.status = 'paid'
            )
       ) / count(*), 1) as paid_pct
from marked m
left join public.profiles p on p.id = m.user_id
group by 1
order by 1 desc;

-- 3b. Credit-pack purchases that came after a user's first reply ----------
-- Conservative: subscription checkouts are not credit_purchases rows, so
-- this counts pack buyers only. Read it as a floor, not the full effect.
with first_reply as (
  select user_id, min(reserved_at) as first_reply_at
  from public.ai_usage_operations
  where source = 'chrome_extension_reply' and status = 'settled'
  group by 1
),
first_purchase as (
  select user_id, min(created_at) as first_paid_at
  from public.credit_purchases
  where status = 'paid'
  group by 1
)
select count(*) as reply_users_total,
       count(fp.user_id) as with_any_pack_purchase,
       count(fp.user_id) filter (where fp.first_paid_at >= fr.first_reply_at) as first_pack_after_first_reply
from first_reply fr
left join first_purchase fp on fp.user_id = fr.user_id;

-- 4. Reply model margin (28 days) ------------------------------------------
-- One request = one billing row (credit_cost 3), but attempts each insert a
-- usage row, so credits are derived from distinct requests, not row sums.
select count(distinct request_id) as billed_requests,
       count(distinct request_id) * 3 as credits_burned,
       count(*) as model_attempts,
       count(distinct user_id) as users,
       round(coalesce(sum(estimated_cost_usd), 0), 4) as est_cost_usd_total,
       round(coalesce(sum(estimated_cost_usd) filter (where provider_cost_class = 'paid'), 0), 4) as est_cost_usd_paid_pool,
       round(coalesce(sum(estimated_cost_usd), 0) / nullif(count(distinct request_id) * 3, 0) * 100, 4) as est_usd_per_100_credits
from public.extension_model_usage
where credit_cost = 3
  and created_at >= now() - interval '28 days';

-- 5. Tiered-send reliability (28 days) --------------------------------------
-- sent = auto-send completed; typed = filled but user pressed send; copied /
-- failed = the fallback tiers. A rising copied+failed share is the rollback
-- trigger for the rollout mode.
select outcome,
       count(*) as sends,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as share_pct,
       count(distinct user_id) as users
from public.extension_reply_send_outcomes
where created_at >= now() - interval '28 days'
group by 1
order by sends desc;
