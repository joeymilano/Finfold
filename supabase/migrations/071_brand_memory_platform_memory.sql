-- 071: Typed platform-specific Brand Memory. Values are validated in the
-- application schema and remain part of the append-only full snapshots from 070.

ALTER TABLE public.brand_brains
  ADD COLUMN IF NOT EXISTS platform_memory jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.brand_brains
  DROP CONSTRAINT IF EXISTS brand_brains_platform_memory_object_check;

ALTER TABLE public.brand_brains
  ADD CONSTRAINT brand_brains_platform_memory_object_check
  CHECK (jsonb_typeof(platform_memory) = 'array');