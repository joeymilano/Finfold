-- ============================================================
-- Flywheel calibration (read-only, run manually in Supabase SQL Editor)
--
-- Joins quality_scores (migration 023) against performance_metrics
-- (migration 022) by (kit_id, platform) and reports, per quality-score
-- dimension, how well that dimension's score correlates with real
-- engagement — using the same weighted engagement formula as the
-- deterministic iteration report (app/api/iterate/route.ts `score()`).
--
-- This does NOT re-weight lib/quality-score.ts automatically. It's a
-- diagnostic: run it periodically once enough (score, real engagement)
-- pairs have accumulated, eyeball which dimensions actually predict
-- performance, and manually adjust the weights in computeQualityScore()
-- if a dimension is consistently uncorrelated or inversely correlated.
-- Bump score_version in quality-score.ts when you do, so old rows stay
-- attributable to the weights that produced them.
-- ============================================================

with engagement as (
  select
    kit_id,
    platform,
    (clicks * 2 + likes + comments * 3 + saves * 2 + shares * 3 + leads * 8 + signups * 10 + revenue) as engagement_score
  from public.performance_metrics
),
joined as (
  select
    qs.platform,
    qs.overall,
    qs.grade,
    qs.dimensions,
    e.engagement_score
  from public.quality_scores qs
  join engagement e
    on e.kit_id = qs.kit_id and e.platform = qs.platform
)
select
  platform,
  count(*) as sample_size,
  corr(overall, engagement_score) as overall_corr,
  corr((dimensions->>'platform')::numeric, engagement_score) as platform_nativeness_corr,
  corr((dimensions->>'cta')::numeric, engagement_score) as cta_strength_corr,
  corr((dimensions->>'ad_risk')::numeric, engagement_score) as ad_risk_corr,
  corr((dimensions->>'brand')::numeric, engagement_score) as brand_consistency_corr,
  corr((dimensions->>'clarity')::numeric, engagement_score) as clarity_corr,
  corr((dimensions->>'english')::numeric, engagement_score) as english_naturalness_corr
from joined
group by platform
having count(*) >= 5  -- corr() on tiny samples is noise, not signal
order by sample_size desc;
