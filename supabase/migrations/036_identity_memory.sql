-- ============================================================
-- 036: Brand Memory supports brands, personal IPs, and hybrids
--
-- identity_type is intentionally nullable for legacy rows. Application code
-- infers legacy records with product data as `brand`, while every new save
-- writes an explicit value. Social profiles are optional public references,
-- not OAuth bindings or credentials.
-- ============================================================

ALTER TABLE public.brand_brains
  ADD COLUMN IF NOT EXISTS identity_type text
    CHECK (identity_type IN ('personal', 'brand', 'hybrid'));

ALTER TABLE public.brand_brains
  ADD COLUMN IF NOT EXISTS social_profiles jsonb NOT NULL DEFAULT '[]'::jsonb;
