-- ============================================================
-- Migration 030: Explicit output feedback
--
-- Editing and performance data tell us what happened after generation.
-- This table captures the missing human judgment signal: whether an output
-- was useful and, when it was not, why. The API turns that explicit signal
-- into approved examples or deterministic anti-pattern rules so future
-- generations can improve without guessing at the user's intent.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.output_feedback (
  id           uuid        primary key default gen_random_uuid(),
  output_id    uuid        not null references public.kit_outputs(id) on delete cascade,
  kit_id       uuid        not null references public.content_kits(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  platform     text        not null,
  rating       text        not null check (rating in ('helpful', 'unhelpful')),
  reason_codes text[]      not null default '{}',
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (output_id, user_id)
);

CREATE INDEX IF NOT EXISTS output_feedback_user_created_idx
  ON public.output_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS output_feedback_kit_idx
  ON public.output_feedback(kit_id);

ALTER TABLE public.output_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "output feedback: select own" ON public.output_feedback;
CREATE POLICY "output feedback: select own"
  ON public.output_feedback FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "output feedback: insert own" ON public.output_feedback;
CREATE POLICY "output feedback: insert own"
  ON public.output_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "output feedback: update own" ON public.output_feedback;
CREATE POLICY "output feedback: update own"
  ON public.output_feedback FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "output feedback: delete own" ON public.output_feedback;
CREATE POLICY "output feedback: delete own"
  ON public.output_feedback FOR DELETE
  USING (auth.uid() = user_id);
