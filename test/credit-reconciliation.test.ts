import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { creditAdjustmentSchema } from "@/lib/payment/reconciliation";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Credits reconciliation", () => {
  it("requires an auditable, non-zero operator adjustment", () => {
    expect(
      creditAdjustmentSchema.parse({
        userId: "a8e77c3e-2687-40f2-849f-b90f67c548eb",
        delta: -100,
        reason: "Remove duplicated grant after receipt review.",
        idempotencyKey: "test-test-test"
      })
    ).toMatchObject({ delta: -100 });
    expect(() =>
      creditAdjustmentSchema.parse({
        userId: "a8e77c3e-2687-40f2-849f-b90f67c548eb",
        delta: 0,
        reason: "short",
        idempotencyKey: "bad"
      })
    ).toThrow();
  });

  it("adds indexed business correlations and append-only adjustments", () => {
    const migration = source(
      "supabase/migrations/059_credit_reconciliation.sql"
    );

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS generation_run_id uuid");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS request_id text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS purchase_id uuid");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS period_key text");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.credit_adjustments");
    expect(migration).toContain("UNIQUE (operator_user_id, idempotency_key)");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.apply_credit_adjustment");
    expect(migration).toContain("INSERT INTO public.credit_transactions");
    expect(migration).not.toMatch(/DELETE FROM public\.credit_transactions/i);
  });

  it("persists a read-only discrepancy report without automatically repairing it", () => {
    const migration = source(
      "supabase/migrations/059_credit_reconciliation.sql"
    );
    const scheduledRoute = source(
      "app/api/internal/credits/reconcile/route.ts"
    );

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.credit_reconciliation_runs");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.credit_reconciliation_items");
    expect(migration).toContain("reserved_runs_without_consume");
    expect(migration).toContain("refunded_runs_without_refund");
    expect(migration).toContain("paid_purchases_without_grant");
    expect(migration).toContain("active_subscriptions_without_plan_grant");
    expect(scheduledRoute).toContain("credit_reconciliation_discrepancy");
    expect(scheduledRoute).toContain("recoverStaleAiUsageOperations");
    expect(scheduledRoute).toContain("AI_USAGE_OPERATION_STALE_AFTER_MS");
  });

  it("exposes reconciliation and adjustment through the existing admin surface", () => {
    const api = source("app/api/admin/credits/reconcile/route.ts");
    const client = source("components/billing/ReconcileClient.tsx");

    expect(api).toContain("requireAdmin");
    expect(api).toContain("runCreditReconciliation");
    expect(api).toContain("applyCreditAdjustment");
    expect(client).toContain("Credits 全账本");
    expect(client).toContain("追加 adjustment");
    expect(client).toContain("不会直接改写历史流水");
  });
});
