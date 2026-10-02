-- ============================================================
-- Migration 015: Editable outputs + edit log
--
-- Generated outputs were read-only — copy or export the AI draft verbatim,
-- or discard it. This adds an editable "final" body per output (separate
-- from the original AI draft, so we can later diff edits into style
-- learning — see plan §4 "编辑回路") plus publish tracking fields the
-- Workbench UI already reads/writes for kit history (kit_outputs.publish_status
-- exists since 001, but published_url/published_at do not yet).
-- ============================================================

ALTER TABLE public.kit_outputs
  ADD COLUMN IF NOT EXISTS final_body text;

ALTER TABLE public.kit_outputs
  ADD COLUMN IF NOT EXISTS user_edited boolean NOT NULL DEFAULT false;

ALTER TABLE public.kit_outputs
  ADD COLUMN IF NOT EXISTS published_url text;

ALTER TABLE public.kit_outputs
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Append-only edit log: every time a user saves an edit to an output body,
-- we record the before/after pair here. This is raw material for the
-- future style-learning loop (diff edits -> distill persistent style rules
-- -> inject into future generations) — see plan §4. Not used for that yet,
-- just captured so it exists in history once that loop ships.
CREATE TABLE IF NOT EXISTS public.output_edits (
  id          uuid        primary key default gen_random_uuid(),
  output_id   uuid        not null references public.kit_outputs(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  field       text        not null check (field in ('body', 'title', 'cta')),
  before_text text        not null,
  after_text  text        not null,
  created_at  timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS output_edits_output_id_idx ON public.output_edits (output_id);

ALTER TABLE public.output_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "output edits: select own" ON public.output_edits;
CREATE POLICY "output edits: select own"
  ON public.output_edits FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "output edits: insert own" ON public.output_edits;
CREATE POLICY "output edits: insert own"
  ON public.output_edits FOR INSERT
  WITH CHECK (auth.uid() = user_id);
