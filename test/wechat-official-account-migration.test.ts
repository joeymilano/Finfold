import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/090_wechat_official_account_sync.sql"),
  "utf8"
);

describe("WeChat Official Account migration", () => {
  it("keeps component tickets and aggregate rows server-only", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.wechat_component_tickets");
    expect(migration).toContain("encrypted_verify_ticket");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.wechat_user_summary_daily");
    expect(migration).toContain("ALTER TABLE public.wechat_component_tickets ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.wechat_user_summary_daily ENABLE ROW LEVEL SECURITY");
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*?wechat_(?:component_tickets|user_summary_daily)/i);
  });

  it("extends one-time authorization to WeChat without weakening PKCE for standard OAuth", () => {
    expect(migration).toContain("p_connector_id NOT IN ('x', 'linkedin', 'wechat')");
    expect(migration).toContain("p_connector_id IN ('x', 'linkedin')");
    expect(migration).toContain("p_connector_id = 'wechat' AND p_encrypted_pkce_verifier IS NOT NULL");
  });

  it("persists official snapshots and exposes only service-role RPC execution", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.save_wechat_official_account_metrics");
    expect(migration).toContain("'official_sync'");
    expect(migration).toContain("ON CONFLICT (connection_account_id, ref_date, user_source) DO UPDATE");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });
});
