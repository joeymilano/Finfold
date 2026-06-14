-- 007_media_bucket.sql
-- Storage bucket for Workbench media uploads (images / videos attached to a
-- content kit). Public read so generated previews can render the URLs; writes
-- are scoped to the owning user's folder, with full service-role access for
-- the server-side upload route.

-- 1. Create the public 'media' bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Anyone can read media (public bucket — needed for preview rendering)
CREATE POLICY "Public read access media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

-- 3. Authenticated users can upload into their own folder (media/<uid>/...)
CREATE POLICY "Users can upload own media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 4. Users can update their own media
CREATE POLICY "Users can update own media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 5. Users can delete their own media
CREATE POLICY "Users can delete own media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Note: the existing "Service role storage access" policy from
-- 001_initial_schema.sql already grants the server-side admin client full
-- access to all buckets, including 'media'.
