-- 070: Append-only full snapshots for explainable Brand Memory history.
-- A trigger observes every writer (manual form, Agent, style learning, and
-- performance adoption) so version history cannot silently miss a write path.

CREATE TABLE IF NOT EXISTS public.brand_memory_versions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot    jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_memory_versions_user_created_idx
  ON public.brand_memory_versions(user_id, created_at DESC);

ALTER TABLE public.brand_memory_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand memory versions: select own" ON public.brand_memory_versions;
CREATE POLICY "brand memory versions: select own"
  ON public.brand_memory_versions FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.record_brand_memory_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.brand_memory_versions (user_id, snapshot)
  VALUES (NEW.user_id, to_jsonb(NEW));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_brand_memory_version ON public.brand_brains;
CREATE TRIGGER record_brand_memory_version
  AFTER INSERT OR UPDATE ON public.brand_brains
  FOR EACH ROW EXECUTE FUNCTION public.record_brand_memory_version();

REVOKE ALL ON FUNCTION public.record_brand_memory_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_brand_memory_version() TO service_role;