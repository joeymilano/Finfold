-- 120: 日更流水线 (daily content pipeline) — per-user settings + per-run
-- observability. Phase 1 covers the WeChat article channel (公众号长文日更);
-- the xhs_cards columns exist for phase 2 (小红书卡片轮播) but nothing writes
-- them yet. All access goes through ownership-checking routes and the
-- internal worker runner — no client policies.

CREATE TABLE IF NOT EXISTS public.content_pipeline_settings (
  user_id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wechat_articles_enabled boolean NOT NULL DEFAULT false,
  wechat_review_mode      text NOT NULL DEFAULT 'every_post',
  wechat_daily_cap        integer NOT NULL DEFAULT 1 CHECK (wechat_daily_cap BETWEEN 0 AND 3),
  wechat_theme            text NOT NULL DEFAULT 'default',
  xhs_cards_enabled       boolean NOT NULL DEFAULT false,
  xhs_card_type           text NOT NULL DEFAULT 'quote',
  xhs_theme               text NOT NULL DEFAULT 'indigo-porcelain',
  xhs_daily_cap           integer NOT NULL DEFAULT 1 CHECK (xhs_daily_cap BETWEEN 0 AND 3),
  xhs_with_illustration   boolean NOT NULL DEFAULT false,
  lead_magnets            jsonb NOT NULL DEFAULT '[]'::jsonb,
  paused                  boolean NOT NULL DEFAULT false,
  paused_reason           text,
  consecutive_failures    integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_pipeline_settings_review_mode_check
    CHECK (wechat_review_mode IN ('every_post', 'jev_guarded')),
  CONSTRAINT content_pipeline_settings_theme_check
    CHECK (wechat_theme IN ('default', 'grace', 'simple')),
  CONSTRAINT content_pipeline_settings_card_type_check
    CHECK (xhs_card_type IN ('quote', 'list', 'opinion'))
);

ALTER TABLE public.content_pipeline_settings ENABLE ROW LEVEL SECURITY;
-- No client policies. Settings change through ownership-checking routes.

-- One row per generation attempt per day per channel, including the days
-- with no output (no topic / no connection / quality gate blocked), so the
-- review console can always answer "what happened today".
CREATE TABLE IF NOT EXISTS public.content_pipeline_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel             text NOT NULL,
  run_date            date NOT NULL DEFAULT CURRENT_DATE,
  status              text NOT NULL,
  topic_ref           text,
  topic_title         text,
  kit_id              uuid REFERENCES public.content_kits(id) ON DELETE SET NULL,
  output_id           uuid REFERENCES public.kit_outputs(id) ON DELETE SET NULL,
  publication_job_id  uuid,
  auto_review         jsonb,
  error_code          text,
  error_message       text,
  extra               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_pipeline_runs_channel_check
    CHECK (channel IN ('wechat_articles', 'xhs_cards')),
  CONSTRAINT content_pipeline_runs_status_check
    CHECK (status IN (
      'awaiting_review',  -- generated, waiting for the human in the console
      'jev_blocked',      -- automated quality gate flagged or was unavailable
      'draft_sent',       -- a draft_only publication job was created
      'discarded',        -- rejected or superseded by a regeneration
      'skipped_no_topic', -- nothing to write about today
      'failed'            -- generation or persistence error
    ))
);

CREATE INDEX IF NOT EXISTS content_pipeline_runs_user_channel_created_idx
  ON public.content_pipeline_runs (user_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS content_pipeline_runs_user_channel_date_idx
  ON public.content_pipeline_runs (user_id, channel, run_date);

ALTER TABLE public.content_pipeline_runs ENABLE ROW LEVEL SECURITY;
-- No client policies. Runs are read and written through ownership-checking
-- routes and the internal worker runner.
