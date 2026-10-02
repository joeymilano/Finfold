-- ============================================================
-- Migration 023: Persist quality scores at generation time
--
-- lib/quality-score.ts has always been computed client-side only
-- (QualityScorePanel) and thrown away — there was no way to ever check
-- whether the heuristic score actually correlates with real performance
-- (performance_metrics, migration 022). This persists the same
-- computeQualityScore() result server-side, once per output, so a future
-- calibration pass has (score, real engagement) pairs to join against.
-- score_version lets a future re-weighting of the heuristic bump forward
-- without invalidating historical rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.quality_scores (
  id            uuid        primary key default gen_random_uuid(),
  output_id     uuid        not null references public.kit_outputs(id) on delete cascade,
  kit_id        uuid        not null references public.content_kits(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  platform      text        not null,
  overall       integer     not null,
  grade         text        not null check (grade in ('A', 'B', 'C', 'D')),
  dimensions    jsonb       not null,
  score_version integer     not null default 1,
  scored_at     timestamptz not null default now(),
  UNIQUE (output_id, score_version)
);

CREATE INDEX IF NOT EXISTS idx_quality_scores_user_platform
  ON public.quality_scores(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_quality_scores_kit
  ON public.quality_scores(kit_id);

ALTER TABLE public.quality_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quality scores: select own" ON public.quality_scores;
CREATE POLICY "quality scores: select own"
  ON public.quality_scores FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "quality scores: insert own" ON public.quality_scores;
CREATE POLICY "quality scores: insert own"
  ON public.quality_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);
