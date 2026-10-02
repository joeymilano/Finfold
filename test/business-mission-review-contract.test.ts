import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  businessMissionReviewRequestSchema,
  measurementWindowRequestSchema
} from "@/lib/business-mission-review";

const idempotencyKey = "33333333-3333-4333-8333-333333333333";

describe("business mission review contract", () => {
  it("requires a bounded explicit measurement window", () => {
    expect(measurementWindowRequestSchema.safeParse({ windowDays: 14, idempotencyKey }).success).toBe(true);
    expect(measurementWindowRequestSchema.safeParse({ windowDays: 0, idempotencyKey }).success).toBe(false);
    expect(measurementWindowRequestSchema.safeParse({ windowDays: 91, idempotencyKey }).success).toBe(false);
  });

  it("requires evidence and exactly one breakpoint for a repair decision", () => {
    expect(businessMissionReviewRequestSchema.safeParse({
      locale: "zh",
      decision: "fix_bottleneck",
      bottleneck: "landing_page",
      evidenceNote: "已核对 CRM 和落地页表单，本周期没有新增提交。",
      extensionDays: null,
      idempotencyKey
    }).success).toBe(true);
    expect(businessMissionReviewRequestSchema.safeParse({
      decision: "fix_bottleneck",
      bottleneck: null,
      evidenceNote: "没有选择断点",
      extensionDays: null,
      idempotencyKey
    }).success).toBe(false);
  });

  it("extends evidence collection instead of converting missing data into failure", () => {
    expect(businessMissionReviewRequestSchema.safeParse({
      decision: "collect_more_evidence",
      bottleneck: null,
      evidenceNote: "支付后台的归因数据仍在延迟，暂时不能确认结果。",
      extensionDays: 7,
      idempotencyKey
    }).success).toBe(true);
  });

  it("keeps review transitions atomic and service-role only", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/086_business_mission_measurement_reviews.sql"),
      "utf8"
    );
    expect(migration).toContain("'review_due'");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.set_business_mission_measurement_window");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.advance_due_business_mission_reviews");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.review_business_growth_mission");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.record_mission_tracking_click");
    expect(migration).toContain("Recorded business evidence is awaiting the user review decision.");
    expect(migration).toContain("AND measurement_due_at <= v_now THEN 'review_due'");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.review_business_growth_mission");
    expect(migration).toContain("TO service_role");
  });
});
