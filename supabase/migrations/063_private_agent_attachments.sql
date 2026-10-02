-- 063_private_agent_attachments.sql
-- Agent attachments may contain confidential drafts and documents. Keep them
-- private and allow writes only through authenticated server routes using the
-- service-role client. The upload route also creates this bucket idempotently
-- so the capability is available during rolling deploys.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'agent-attachments',
  'agent-attachments',
  false,
  26214400,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv', 'application/csv', 'text/plain', 'text/markdown'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read access agent attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload agent attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can update agent attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete agent attachments" ON storage.objects;
