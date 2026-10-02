-- ============================================================
-- Migration 024: Few-shot backflow experiment bucketing
--
-- generate/route.ts and watch-sources/check now optionally inject the
-- user's own highest-performing past posts (per platform, from
-- performance_metrics) as few-shot examples into the generation prompt
-- (lib/performance-examples.ts). Recording which bucket a kit landed in —
-- and what was actually injected — is what makes it possible to later
-- compare treatment vs. control engagement and prove the backflow helps
-- rather than just trusting that it does.
--
-- experiment_bucket is NULL, not 'control', when there was nothing to
-- inject (cold start / no qualifying history) — a kit with nothing to
-- inject was never a candidate for the experiment at all, and lumping it
-- into 'control' would dilute the control group with kits that couldn't
-- have shown a treatment effect either way.
-- ============================================================

ALTER TABLE public.content_kits
  ADD COLUMN IF NOT EXISTS experiment_bucket text
    CHECK (experiment_bucket IN ('treatment', 'control')),
  ADD COLUMN IF NOT EXISTS flywheel_meta jsonb;
