import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { persistenceUnavailableMessage } from "@/lib/runtime-mode";

export const creditAdjustmentSchema = z.object({
  userId: z.string().uuid(),
  delta: z.number().int().refine((value) => value !== 0, {
    message: "Adjustment delta cannot be zero."
  }),
  reason: z.string().trim().min(8).max(1000),
  idempotencyKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/),
  relatedGenerationRunId: z.string().uuid().nullable().optional(),
  relatedPurchaseId: z.string().uuid().nullable().optional()
});

export type CreditReconciliationSummary = {
  id: string;
  status: "running" | "completed" | "failed";
  usersScanned: number;
  discrepancyUsers: number;
  issueCount: number;
  startedAt: string;
  completedAt: string | null;
};

export type CreditReconciliationItem = {
  userId: string;
  balanceRemaining: number;
  ledgerDelta: number;
  balanceDifference: number;
  reservedRunsWithoutConsume: number;
  refundedRunsWithoutRefund: number;
  paidPurchasesWithoutGrant: number;
  activeSubscriptionsWithoutPlanGrant: number;
  issueCount: number;
};

type ReconciliationRunRow = {
  id: string;
  status: "running" | "completed" | "failed";
  users_scanned: number;
  discrepancy_users: number;
  issue_count: number;
  started_at: string;
  completed_at: string | null;
};

type ReconciliationItemRow = {
  user_id: string;
  balance_remaining: number;
  ledger_delta: number;
  balance_difference: number;
  reserved_runs_without_consume: number;
  refunded_runs_without_refund: number;
  paid_purchases_without_grant: number;
  active_subscriptions_without_plan_grant: number;
  issue_count: number;
};

function adminClient() {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error(persistenceUnavailableMessage("Credits reconciliation"));
  }
  return admin;
}

export async function runCreditReconciliation(): Promise<{
  reconciliationRunId: string;
  usersScanned: number;
  discrepancyUsers: number;
  issueCount: number;
}> {
  const { data, error } = await adminClient().rpc(
    "run_credit_reconciliation"
  );
  if (error) throw error;
  const result = (data ?? {}) as Record<string, unknown>;
  return {
    reconciliationRunId: String(result.reconciliationRunId ?? ""),
    usersScanned: Number(result.usersScanned ?? 0),
    discrepancyUsers: Number(result.discrepancyUsers ?? 0),
    issueCount: Number(result.issueCount ?? 0)
  };
}

export async function getCreditReconciliationReport(
  requestedRunId?: string | null
): Promise<{
  run: CreditReconciliationSummary | null;
  items: CreditReconciliationItem[];
}> {
  const admin = adminClient();
  let runQuery = admin
    .from("credit_reconciliation_runs")
    .select(
      "id, status, users_scanned, discrepancy_users, issue_count, started_at, completed_at"
    );
  runQuery = requestedRunId
    ? runQuery.eq("id", requestedRunId)
    : runQuery.order("started_at", { ascending: false }).limit(1);

  const { data: runData, error: runError } = await runQuery.maybeSingle();
  if (runError) throw runError;
  if (!runData) return { run: null, items: [] };

  const run = runData as ReconciliationRunRow;
  const { data: itemData, error: itemError } = await admin
    .from("credit_reconciliation_items")
    .select(
      "user_id, balance_remaining, ledger_delta, balance_difference, reserved_runs_without_consume, refunded_runs_without_refund, paid_purchases_without_grant, active_subscriptions_without_plan_grant, issue_count"
    )
    .eq("reconciliation_run_id", run.id)
    .gt("issue_count", 0)
    .order("issue_count", { ascending: false })
    .limit(500);
  if (itemError) throw itemError;

  return {
    run: {
      id: run.id,
      status: run.status,
      usersScanned: Number(run.users_scanned),
      discrepancyUsers: Number(run.discrepancy_users),
      issueCount: Number(run.issue_count),
      startedAt: run.started_at,
      completedAt: run.completed_at
    },
    items: ((itemData ?? []) as ReconciliationItemRow[]).map((item) => ({
      userId: item.user_id,
      balanceRemaining: Number(item.balance_remaining),
      ledgerDelta: Number(item.ledger_delta),
      balanceDifference: Number(item.balance_difference),
      reservedRunsWithoutConsume: Number(
        item.reserved_runs_without_consume
      ),
      refundedRunsWithoutRefund: Number(
        item.refunded_runs_without_refund
      ),
      paidPurchasesWithoutGrant: Number(
        item.paid_purchases_without_grant
      ),
      activeSubscriptionsWithoutPlanGrant: Number(
        item.active_subscriptions_without_plan_grant
      ),
      issueCount: Number(item.issue_count)
    }))
  };
}

export async function applyCreditAdjustment(
  operatorUserId: string,
  rawInput: unknown
): Promise<{
  outcome: string;
  adjustmentId: string;
  transactionId: string;
  available: number;
}> {
  const input = creditAdjustmentSchema.parse(rawInput);
  const { data, error } = await adminClient().rpc("apply_credit_adjustment", {
    p_user_id: input.userId,
    p_operator_user_id: operatorUserId,
    p_delta: input.delta,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
    p_related_generation_run_id: input.relatedGenerationRunId ?? null,
    p_related_purchase_id: input.relatedPurchaseId ?? null
  });
  if (error) throw error;
  const result = (data ?? {}) as Record<string, unknown>;
  return {
    outcome: String(result.outcome ?? "unknown"),
    adjustmentId: String(result.adjustmentId ?? ""),
    transactionId: String(result.transactionId ?? ""),
    available: Number(result.available ?? 0)
  };
}
