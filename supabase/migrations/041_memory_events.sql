-- ============================================================
-- Migration 041: Brand memory event ledger
--
-- brand_brains.learned_style / learned_negative / performance_rules are
-- plain string[] columns with no history — every write overwrites the
-- array, so there's no way to show a user WHEN a rule was learned or WHICH
-- kit/edit taught it. This is an append-only log of every memory-write
-- event, additive to those arrays (never replaces them), so the product can
-- render "your brand's memory growing over time" instead of only its
-- current snapshot. See lib/memory-events.ts for the insert helper.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.brand_memory_events (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  event_type     text        not null check (event_type in (
                   'style_rule', 'negative_rule', 'performance_rule',
                   'approved_example', 'feedback_rule', 'context_field'
                 )),
  rule_text      text        not null,
  source_kit_id    uuid      references public.content_kits(id) on delete set null,
  source_output_id uuid      references public.kit_outputs(id) on delete set null,
  created_at     timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS brand_memory_events_user_created_idx
  ON public.brand_memory_events(user_id, created_at DESC);

ALTER TABLE public.brand_memory_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand memory events: select own" ON public.brand_memory_events;
CREATE POLICY "brand memory events: select own"
  ON public.brand_memory_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "brand memory events: insert own" ON public.brand_memory_events;
CREATE POLICY "brand memory events: insert own"
  ON public.brand_memory_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Backfill: approximate a first event per existing non-empty learned array
-- so users who already accumulated memory before this migration see a
-- ledger instead of an empty timeline. Uses brand_brains.updated_at as the
-- best available timestamp (the exact original write time isn't recoverable).
INSERT INTO public.brand_memory_events (user_id, event_type, rule_text, created_at)
SELECT user_id, 'style_rule', rule, updated_at
FROM public.brand_brains, unnest(learned_style) AS rule
WHERE learned_style IS NOT NULL AND array_length(learned_style, 1) > 0;

INSERT INTO public.brand_memory_events (user_id, event_type, rule_text, created_at)
SELECT user_id, 'negative_rule', rule, updated_at
FROM public.brand_brains, unnest(learned_negative) AS rule
WHERE learned_negative IS NOT NULL AND array_length(learned_negative, 1) > 0;

INSERT INTO public.brand_memory_events (user_id, event_type, rule_text, created_at)
SELECT user_id, 'performance_rule', rule, updated_at
FROM public.brand_brains, unnest(performance_rules) AS rule
WHERE performance_rules IS NOT NULL AND array_length(performance_rules, 1) > 0;

INSERT INTO public.brand_memory_events (user_id, event_type, rule_text, created_at)
SELECT user_id, 'approved_example', example, updated_at
FROM public.brand_brains, unnest(approved_examples) AS example
WHERE approved_examples IS NOT NULL AND array_length(approved_examples, 1) > 0;
