-- ============================================================
-- Flywheel experiment readout (read-only, run manually)
--
-- Compares kits generated with few-shot performance examples injected
-- ('treatment', see lib/flywheel-experiment.ts) against kits where
-- qualifying history existed but examples were withheld ('control').
-- Kits with experiment_bucket IS NULL never had qualifying history to
-- inject either way and are excluded — they were never a fair comparison
-- point, and including them would just dilute both groups toward the
-- cold-start baseline.
--
-- Two signals:
--   1. Real engagement (join performance_metrics), using the same weighted
--      formula as app/api/iterate/route.ts `score()`.
--   2. Edit rate — how often the user rewrote the AI draft before
--      publishing (kit_outputs.user_edited). A lower edit rate in
--      treatment is itself evidence the injected examples produced
--      content closer to what the user actually wants.
-- ============================================================

with engagement as (
  select kit_id, platform,
    (clicks * 2 + likes + comments * 3 + saves * 2 + shares * 3 + leads * 8 + signups * 10 + revenue) as engagement_score
  from public.performance_metrics
),
kit_engagement as (
  select ck.id as kit_id, ck.experiment_bucket, avg(e.engagement_score) as avg_engagement
  from public.content_kits ck
  join engagement e on e.kit_id = ck.id
  where ck.experiment_bucket is not null
  group by ck.id, ck.experiment_bucket
),
kit_edits as (
  select ck.id as kit_id, ck.experiment_bucket,
    avg(case when ko.user_edited then 1.0 else 0.0 end) as edit_rate
  from public.content_kits ck
  join public.kit_outputs ko on ko.kit_id = ck.id
  where ck.experiment_bucket is not null
  group by ck.id, ck.experiment_bucket
)
select
  'engagement' as metric,
  experiment_bucket,
  count(*) as kit_count,
  avg(avg_engagement) as mean_value
from kit_engagement
group by experiment_bucket
union all
select
  'edit_rate' as metric,
  experiment_bucket,
  count(*) as kit_count,
  avg(edit_rate) as mean_value
from kit_edits
group by experiment_bucket
order by metric, experiment_bucket;
