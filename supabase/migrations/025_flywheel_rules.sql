-- ============================================================
-- Migration 025: Negative-learning + adopted performance rules
--
-- Mirrors migration 019's learned_style column exactly, but for two other
-- rule sources that also feed buildBrainPromptSection (lib/brand-brain.ts):
--   - learned_negative: LLM-distilled "avoid this" rules, mined from this
--     user's own underperforming posts (lib/negative-learning.ts). The
--     other half of the backflow loop that migration 019/022 started —
--     019 learns from user edits, this learns from real audience reaction.
--   - performance_rules: nextActions from an iteration report that the
--     user explicitly clicked "adopt" on (app/api/iterate/adopt/route.ts).
--     Human-in-the-loop by design — the LLM authors a suggestion, the user
--     decides whether it actually becomes a standing rule.
-- Both capped in application code (5 each), not here — same pattern as
-- learned_style's 10-cap.
-- ============================================================

ALTER TABLE public.brand_brains
  ADD COLUMN IF NOT EXISTS learned_negative text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS performance_rules text[] NOT NULL DEFAULT '{}';
