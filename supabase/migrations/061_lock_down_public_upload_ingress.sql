-- 061_lock_down_public_upload_ingress.sql
-- User uploads must pass through authenticated server routes that enforce
-- byte signatures, dimensions, ownership, and request limits. The original
-- Storage policies allowed a signed-in browser to write directly to a public
-- bucket and bypass every application check.

-- Defense in depth at Storage. These declarations do not replace server-side
-- byte inspection because Content-Type remains caller-controlled.
UPDATE storage.buckets
SET file_size_limit = 26214400,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'media';

UPDATE storage.buckets
SET file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'avatars';

-- All product upload/delete flows already use the service-role client after
-- an explicit owner check. Remove direct browser mutations so an authenticated
-- Supabase JWT cannot bypass that trusted path.
DROP POLICY IF EXISTS "Users can upload own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

-- Production also contains a second, independently named pair of avatar
-- mutation policies. Keep these explicit drops even though they are not in
-- the repository's original migration history: otherwise signed-in browsers
-- could continue bypassing the server route after this migration succeeds.
DROP POLICY IF EXISTS "avatars: upload own" ON storage.objects;
DROP POLICY IF EXISTS "avatars: update own" ON storage.objects;
DROP POLICY IF EXISTS "avatars: delete own" ON storage.objects;

-- Fail closed if an environment has another direct-write policy name that was
-- not audited above. Public reads are intentionally retained; service-role
-- access does not mention either bucket and therefore is not matched here.
DO $$
DECLARE
  residual_policy_names text;
BEGIN
  SELECT string_agg(policyname, ', ' ORDER BY policyname)
  INTO residual_policy_names
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
    AND (
      array_position(roles, 'public'::name) IS NOT NULL
      OR array_position(roles, 'authenticated'::name) IS NOT NULL
    )
    AND (
      concat_ws(' ', qual, with_check) ILIKE '%media%'
      OR concat_ws(' ', qual, with_check) ILIKE '%avatars%'
    );

  IF residual_policy_names IS NOT NULL THEN
    RAISE EXCEPTION
      'Direct upload Storage policies remain after lockdown: %',
      residual_policy_names;
  END IF;
END;
$$;

-- Public SELECT remains for existing product URLs. Moving unprocessed objects
-- to a private bucket with signed delivery is a separate P0-F architecture
-- change; this migration only closes the direct-write bypass.
