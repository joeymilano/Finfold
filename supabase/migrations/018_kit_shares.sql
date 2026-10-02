-- ============================================================
-- Migration 018: Public kit share pages
--
-- Backs /share/[slug] — the growth loop where a user's generated kit
-- becomes a public page (cover image as OG, "Made with Finfold" footer)
-- that they post to 即刻/V2EX/Reddit/X themselves (plan §6 "非 SEO 增长").
-- One kit can have at most one active share slug; toggling share off
-- just flips is_public rather than deleting the row, so view_count and
-- the slug survive a re-share.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kit_shares (
  id         uuid        primary key default gen_random_uuid(),
  kit_id     uuid        not null references public.content_kits(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  slug       text        not null unique,
  is_public  boolean     not null default true,
  view_count integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kit_id)
);

CREATE INDEX IF NOT EXISTS kit_shares_slug_idx ON public.kit_shares (slug);

ALTER TABLE public.kit_shares ENABLE ROW LEVEL SECURITY;

-- Owners manage their own share row (create/toggle/delete).
DROP POLICY IF EXISTS "kit shares: select own" ON public.kit_shares;
CREATE POLICY "kit shares: select own"
  ON public.kit_shares FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "kit shares: insert own" ON public.kit_shares;
CREATE POLICY "kit shares: insert own"
  ON public.kit_shares FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "kit shares: update own" ON public.kit_shares;
CREATE POLICY "kit shares: update own"
  ON public.kit_shares FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "kit shares: delete own" ON public.kit_shares;
CREATE POLICY "kit shares: delete own"
  ON public.kit_shares FOR DELETE
  USING (auth.uid() = user_id);

-- Public read of the share row itself (needed so the /share/[slug] route
-- can resolve slug -> kit_id) is intentionally NOT granted here — the
-- route reads via the service-role admin client server-side instead, so
-- anonymous visitors never get a Postgres session that could enumerate
-- other users' kit_shares/content_kits/kit_outputs rows.

-- Atomically increments a share's view count. SECURITY DEFINER so the
-- anonymous /share/[slug] page (no Postgres session) can bump it without
-- needing a public UPDATE policy that would otherwise let anyone tamper
-- with any row.
CREATE OR REPLACE FUNCTION public.increment_kit_share_view(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.kit_shares
  SET view_count = view_count + 1
  WHERE slug = p_slug AND is_public = true;
END;
$$;
