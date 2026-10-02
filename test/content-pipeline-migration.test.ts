import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/120_content_pipeline.sql"),
  "utf8"
);

const migration121 = readFileSync(
  join(process.cwd(), "supabase/migrations/121_content_pipeline_xhs_theme.sql"),
  "utf8"
);

describe("Daily content pipeline migration", () => {
  it("creates per-user settings with the pilot-era constraints and no client policies", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.content_pipeline_settings");
    expect(migration).toContain("wechat_articles_enabled boolean NOT NULL DEFAULT false");
    expect(migration).toContain("CHECK (wechat_review_mode IN ('every_post', 'jev_guarded'))");
    expect(migration).toMatch(/lead_magnets\s+jsonb NOT NULL DEFAULT '\[\]'::jsonb/);
    expect(migration).toContain("ALTER TABLE public.content_pipeline_settings ENABLE ROW LEVEL SECURITY");
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*?content_pipeline_settings/i);
  });

  it("records every daily run including the no-output days, server-only", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.content_pipeline_runs");
    expect(migration).toContain("'awaiting_review'");
    expect(migration).toContain("'jev_blocked'");
    expect(migration).toContain("'draft_sent'");
    expect(migration).toContain("'skipped_no_topic'");
    expect(migration).toContain("content_pipeline_runs_user_channel_created_idx");
    expect(migration).toContain("ALTER TABLE public.content_pipeline_runs ENABLE ROW LEVEL SECURITY");
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*?content_pipeline_runs/i);
  });

  it("links runs to the existing kit and output rows without blocking cleanup", () => {
    expect(migration).toContain("REFERENCES public.content_kits(id) ON DELETE SET NULL");
    expect(migration).toContain("REFERENCES public.kit_outputs(id) ON DELETE SET NULL");
    expect(migration).toContain("publication_job_id  uuid");
  });

  it("migration 121 aligns xhs_theme with the VisualStory enum and adds a card review mode", () => {
    expect(migration121).toContain("ALTER COLUMN xhs_theme SET DEFAULT 'editorial'");
    expect(migration121).toContain("WHERE xhs_theme NOT IN ('editorial', 'signal', 'field-notes')");
    expect(migration121).toContain("ADD COLUMN IF NOT EXISTS xhs_review_mode text NOT NULL DEFAULT 'every_post'");
    expect(migration121).toContain("content_pipeline_settings_xhs_review_mode_check");
  });
});
