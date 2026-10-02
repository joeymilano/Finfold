import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendTrackingParams,
  campaignSlug,
  generateTrackingCode,
  manualOutcomeSchema,
  sanitizeTrackingDestination,
  summarizeMissionOutcomeRows
} from "@/lib/mission-attribution";

describe("mission attribution", () => {
  it("keeps multi-row mission mutations atomic and service-role only", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/081_mission_attribution_loop.sql"), "utf8");
    expect(migration).toContain("CREATE TRIGGER growth_mission_execution_ledger");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.apply_mission_action_decision");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.record_mission_outcome");
    expect(migration).toContain("ON CONFLICT (mission_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.record_mission_outcome");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.record_mission_outcome");
  });

  it("aggregates compact outcome rows by their durable quantity", () => {
    expect(summarizeMissionOutcomeRows([
      { event_type: "click", quantity: 3, value: 0, currency: "CNY" },
      { event_type: "lead", quantity: 2, value: 0, currency: "CNY" },
      { event_type: "signup", quantity: 1, value: 0, currency: "CNY" },
      { event_type: "revenue", quantity: 1, value: 880, currency: "CNY" }
    ])).toEqual({
      views: 0,
      clicks: 3,
      leads: 2,
      signups: 1,
      trials: 0,
      purchases: 0,
      revenue: 880,
      currency: "CNY"
    });
  });

  it("preserves destination query params and attaches mission attribution", () => {
    const url = new URL(appendTrackingParams("https://example.com/signup?plan=starter", {
      source: "xiaohongshu",
      medium: "organic_social",
      campaign: "starter-growth",
      content: "carousel-a"
    }));
    expect(url.searchParams.get("plan")).toBe("starter");
    expect(url.searchParams.get("utm_source")).toBe("xiaohongshu");
    expect(url.searchParams.get("utm_medium")).toBe("organic_social");
    expect(url.searchParams.get("utm_campaign")).toBe("starter-growth");
    expect(url.searchParams.get("utm_content")).toBe("carousel-a");
  });

  it("only accepts public HTTP destinations", () => {
    expect(sanitizeTrackingDestination("https://finfold.app/pricing")).toBe("https://finfold.app/pricing");
    expect(() => sanitizeTrackingDestination("http://localhost:3000/admin")).toThrow("public website");
    expect(() => sanitizeTrackingDestination("http://169.254.169.254/latest/meta-data")).toThrow("public website");
    expect(() => sanitizeTrackingDestination("file:///tmp/private")).toThrow("HTTP or HTTPS");
  });

  it("requires positive revenue and produces opaque tracking codes", () => {
    const idempotencyKey = "3df64d3e-52fd-4c25-9b89-680861c0d2f5";
    expect(manualOutcomeSchema.safeParse({ eventType: "revenue", count: 1, value: 0, currency: "CNY", note: "", idempotencyKey }).success).toBe(false);
    expect(manualOutcomeSchema.safeParse({ eventType: "revenue", count: 1, value: 100, currency: "CNY", note: "", idempotencyKey }).success).toBe(true);
    expect(generateTrackingCode()).toMatch(/^[a-f0-9]{20}$/);
    expect(campaignSlug("建立 Starter 注册闭环")).toBe("starter");
  });
});
