-- 113: Account Health diagnosis accepts LinkedIn personal profiles
-- Extends the platform check only; storage, tenant isolation, and RLS are
-- unchanged. LinkedIn reports reuse the existing evidence-level and
-- collection-method values.

ALTER TABLE public.account_investigations
  DROP CONSTRAINT IF EXISTS account_investigations_platform_check;
ALTER TABLE public.account_investigations
  ADD CONSTRAINT account_investigations_platform_check
  CHECK (platform IN ('xiaohongshu', 'x', 'reddit', 'linkedin'));
