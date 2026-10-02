-- 117: Jev topic-recommendation audit column for agent pending actions.
--
-- research_xhs_topics asks Jev (TypeSafe System One) to score each topic
-- candidate (positioning fit + differentiation) and pick the strongest one
-- before the select_topic card is created. auto_review stores that verdict
-- for the workflow card badge; the action fingerprint still hashes only
-- payload, so recommendations never break idempotency. Jev outages skip
-- the badge entirely (fail open).
ALTER TABLE public.agent_pending_actions
  ADD COLUMN IF NOT EXISTS auto_review jsonb
  CHECK (auto_review IS NULL OR jsonb_typeof(auto_review) = 'object');
