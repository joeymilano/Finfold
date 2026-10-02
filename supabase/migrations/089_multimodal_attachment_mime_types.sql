-- Keep the existing private Agent attachment bucket aligned with the shared
-- upload policy. Migration 063 predates structured data formats such as JSON,
-- XML, YAML and TSV; without this update, production storage can reject files
-- that the Agent, Workbench and MCP extractors now support.

UPDATE storage.buckets
SET public = false,
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/webm',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv', 'application/csv',
      'text/tab-separated-values',
      'application/json', 'text/json',
      'application/xml', 'text/xml',
      'application/yaml', 'application/x-yaml', 'text/yaml',
      'text/plain', 'text/markdown'
    ]::text[]
WHERE id = 'agent-attachments';
