-- ============================================================
-- Migration 000: Fresh-project core schema bootstrap
--
-- The original core tables lived only in the historical schema.sql snapshot,
-- while migrations 002+ assumed they already existed. Keep this migration
-- first so a new project can be created from supabase/migrations alone.
-- Everything is idempotent for projects that already contain the core schema.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id                    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 text,
  plan                  text        NOT NULL DEFAULT 'free',
  monthly_limit         integer     NOT NULL DEFAULT 3,
  locale                text        DEFAULT 'zh' CHECK (locale IN ('zh', 'en')),
  creem_subscription_id text,
  subscription_status   text        DEFAULT 'active',
  renewed_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_kits (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idea_text    text        NOT NULL,
  goal         text        NOT NULL,
  persona      text        NOT NULL,
  platforms    text[]      NOT NULL DEFAULT '{}',
  media_assets jsonb       NOT NULL DEFAULT '[]'::jsonb,
  status       text        NOT NULL DEFAULT 'saved'
                           CHECK (status IN ('preview', 'saved', 'published', 'analyzed')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kit_outputs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id         uuid        NOT NULL REFERENCES public.content_kits(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform       text        NOT NULL,
  title          text        NOT NULL DEFAULT '',
  body           text        NOT NULL DEFAULT '',
  cta            text        NOT NULL DEFAULT '',
  notes          text        NOT NULL DEFAULT '',
  strategy       text        NOT NULL DEFAULT '',
  locked         boolean     NOT NULL DEFAULT false,
  publish_status text        NOT NULL DEFAULT 'draft'
                               CHECK (publish_status IN ('draft', 'planned', 'posted', 'measured', 'iterated')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name text        NOT NULL,
  metadata   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id       text,
  stripe_subscription_id   text,
  status                   text        NOT NULL DEFAULT 'incomplete',
  current_period_end       timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.performance_metrics (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id        uuid        NOT NULL REFERENCES public.content_kits(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform      text        NOT NULL,
  impressions   integer     NOT NULL DEFAULT 0,
  clicks        integer     NOT NULL DEFAULT 0,
  likes         integer     NOT NULL DEFAULT 0,
  comments      integer     NOT NULL DEFAULT 0,
  saves         integer     NOT NULL DEFAULT 0,
  shares        integer     NOT NULL DEFAULT 0,
  leads         integer     NOT NULL DEFAULT 0,
  signups       integer     NOT NULL DEFAULT 0,
  revenue       numeric     NOT NULL DEFAULT 0,
  published_url text,
  measured_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kit_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_content_kits_user_created
  ON public.content_kits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kit_outputs_kit_id
  ON public.kit_outputs(kit_id);
CREATE INDEX IF NOT EXISTS idx_kit_outputs_user_id
  ON public.kit_outputs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_user_created
  ON public.usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_kit_id
  ON public.performance_metrics(kit_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kits: select own" ON public.content_kits;
CREATE POLICY "kits: select own" ON public.content_kits
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "kits: insert own" ON public.content_kits;
CREATE POLICY "kits: insert own" ON public.content_kits
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "kits: update own" ON public.content_kits;
CREATE POLICY "kits: update own" ON public.content_kits
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "kits: delete own" ON public.content_kits;
CREATE POLICY "kits: delete own" ON public.content_kits
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "outputs: select own" ON public.kit_outputs;
CREATE POLICY "outputs: select own" ON public.kit_outputs
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "outputs: insert own" ON public.kit_outputs;
CREATE POLICY "outputs: insert own" ON public.kit_outputs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "outputs: update own" ON public.kit_outputs;
CREATE POLICY "outputs: update own" ON public.kit_outputs
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "outputs: delete own" ON public.kit_outputs;
CREATE POLICY "outputs: delete own" ON public.kit_outputs
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "events: select own" ON public.usage_events;
CREATE POLICY "events: select own" ON public.usage_events
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "events: insert own" ON public.usage_events;
CREATE POLICY "events: insert own" ON public.usage_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "subs: select own" ON public.subscriptions;
CREATE POLICY "subs: select own" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "perf: select own" ON public.performance_metrics;
CREATE POLICY "perf: select own" ON public.performance_metrics
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "perf: insert own" ON public.performance_metrics;
CREATE POLICY "perf: insert own" ON public.performance_metrics
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "perf: update own" ON public.performance_metrics;
CREATE POLICY "perf: update own" ON public.performance_metrics
  FOR UPDATE USING (auth.uid() = user_id);
