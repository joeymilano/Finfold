-- 078: Evidence-first Research Center.
--
-- A research mission stores its source evidence and the resulting strategic
-- decision together. Conclusions remain auditable by evidence ID and may be
-- handed to Strategy/Create without pretending public-web observations are
-- licensed or first-party platform measurements.

CREATE TABLE IF NOT EXISTS public.research_missions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operating_program_id uuid        REFERENCES public.operating_programs(id) ON DELETE SET NULL,
  platform             text        NOT NULL DEFAULT 'xiaohongshu',
  mission_type         text        NOT NULL,
  title                text        NOT NULL CHECK (char_length(title) BETWEEN 2 AND 160),
  question             text        NOT NULL CHECK (char_length(question) BETWEEN 10 AND 1200),
  subjects             jsonb       NOT NULL DEFAULT '[]',
  evidence             jsonb       NOT NULL DEFAULT '[]',
  status               text        NOT NULL DEFAULT 'collecting',
  decision             jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_missions_platform_check
    CHECK (platform IN ('xiaohongshu', 'x', 'wechat')),
  CONSTRAINT research_missions_type_check
    CHECK (mission_type IN ('account_diagnosis', 'creator_scout', 'category_opportunity', 'product_competitor')),
  CONSTRAINT research_missions_status_check
    CHECK (status IN ('collecting', 'ready', 'archived')),
  CONSTRAINT research_missions_subjects_array_check
    CHECK (jsonb_typeof(subjects) = 'array'),
  CONSTRAINT research_missions_evidence_array_check
    CHECK (jsonb_typeof(evidence) = 'array'),
  CONSTRAINT research_missions_decision_object_check
    CHECK (decision IS NULL OR jsonb_typeof(decision) = 'object')
);

CREATE INDEX IF NOT EXISTS research_missions_user_updated_idx
  ON public.research_missions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS research_missions_program_updated_idx
  ON public.research_missions(operating_program_id, updated_at DESC);

ALTER TABLE public.research_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "research missions: select own" ON public.research_missions;
CREATE POLICY "research missions: select own"
  ON public.research_missions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "research missions: insert own" ON public.research_missions;
CREATE POLICY "research missions: insert own"
  ON public.research_missions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "research missions: update own" ON public.research_missions;
CREATE POLICY "research missions: update own"
  ON public.research_missions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "research missions: delete own" ON public.research_missions;
CREATE POLICY "research missions: delete own"
  ON public.research_missions FOR DELETE USING (auth.uid() = user_id);
