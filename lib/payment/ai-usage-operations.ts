import type { ActionKey } from "@/lib/payment/types";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";

export type AiUsageOperationStatus = "reserved" | "started" | "settled" | "refunded";

export type ReserveAiUsageOperationInput = {
  operationKey: string;
  userId: string;
  action: ActionKey | string;
  cost: number;
  source: string;
  detail?: Record<string, unknown>;
};

export type ReserveAiUsageOperationResult =
  | { outcome: "reserved"; operationId: string; available: number }
  | { outcome: "insufficient_credits"; available: number }
  | { outcome: "existing"; operationId: string; status: AiUsageOperationStatus; available: number };

type ReserveAiUsageOperationRow = {
  operation_id: unknown;
  status: unknown;
  available: unknown;
  is_new: unknown;
};

type RefundAiUsageOperationRow = {
  status: unknown;
  refunded: unknown;
  available: unknown;
};

function isAvailable(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseStatus(value: unknown): AiUsageOperationStatus | null {
  return value === "reserved" || value === "started" || value === "settled" || value === "refunded"
    ? value
    : null;
}

function singleRow<T>(value: unknown): T | null {
  return Array.isArray(value) && value.length === 1 && typeof value[0] === "object" && value[0] !== null
    ? value[0] as T
    : null;
}

/**
 * Atomically records a named AI operation and reserves its Credits exactly
 * once. An existing key is never eligible for another provider call.
 */
export async function reserveAiUsageOperation(
  input: ReserveAiUsageOperationInput
): Promise<ReserveAiUsageOperationResult> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    if (isLocalMockMode()) {
      return { outcome: "reserved", operationId: crypto.randomUUID(), available: 9999 };
    }
    throw new Error(persistenceUnavailableMessage("AI usage reservation"));
  }

  const { data, error } = await supabase.rpc("reserve_ai_usage_operation", {
    p_operation_key: input.operationKey,
    p_user_id: input.userId,
    p_action: input.action,
    p_cost: input.cost,
    p_source: input.source,
    p_detail: input.detail ?? {}
  });
  if (error) throw new Error("Failed to reserve AI Credits. Please try again.");

  const row = singleRow<ReserveAiUsageOperationRow>(data);
  if (!row || !isAvailable(row.available)) {
    throw new Error("AI Credits reservation returned an invalid result.");
  }
  if (row.status === "insufficient_credits" && row.operation_id === null && row.is_new === true) {
    return { outcome: "insufficient_credits", available: row.available };
  }

  const status = parseStatus(row.status);
  if (!status || typeof row.operation_id !== "string" || row.operation_id.length === 0 || typeof row.is_new !== "boolean") {
    throw new Error("AI Credits reservation returned an invalid result.");
  }
  if (row.is_new && status === "reserved") {
    return { outcome: "reserved", operationId: row.operation_id, available: row.available };
  }
  if (!row.is_new) {
    return { outcome: "existing", operationId: row.operation_id, status, available: row.available };
  }

  throw new Error("AI Credits reservation returned an invalid result.");
}

/** Mark an operation as about to invoke its provider. A started operation is never auto-refunded. */
export async function startAiUsageOperation(userId: string, operationId: string): Promise<AiUsageOperationStatus> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    if (isLocalMockMode()) return "started";
    throw new Error(persistenceUnavailableMessage("AI usage start"));
  }

  const { data, error } = await supabase.rpc("start_ai_usage_operation", {
    p_operation_id: operationId,
    p_user_id: userId
  });
  const status = parseStatus(data);
  if (error || !status) throw new Error("Failed to start AI Credits usage.");
  return status;
}

/** Mark a reserved AI operation as successfully completed. Safe to replay. */
export async function settleAiUsageOperation(userId: string, operationId: string): Promise<AiUsageOperationStatus> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    if (isLocalMockMode()) return "settled";
    throw new Error(persistenceUnavailableMessage("AI usage settlement"));
  }

  const { data, error } = await supabase.rpc("settle_ai_usage_operation", {
    p_operation_id: operationId,
    p_user_id: userId
  });
  const status = parseStatus(data);
  if (error || !status) throw new Error("Failed to settle AI Credits usage.");
  return status;
}

/** Refund an operation after a known pre-result failure. Safe to replay and never refunds a settled operation. */
export async function refundAiUsageOperation(
  userId: string,
  operationId: string,
  reason: string
): Promise<{ status: AiUsageOperationStatus; refunded: boolean; available: number }> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    if (isLocalMockMode()) return { status: "refunded", refunded: true, available: 9999 };
    throw new Error(persistenceUnavailableMessage("AI usage refund"));
  }

  const { data, error } = await supabase.rpc("refund_ai_usage_operation", {
    p_operation_id: operationId,
    p_user_id: userId,
    p_reason: reason
  });
  const row = singleRow<RefundAiUsageOperationRow>(data);
  const status = parseStatus(row?.status);
  if (error || !row || !status || typeof row.refunded !== "boolean" || !isAvailable(row.available)) {
    throw new Error("Failed to refund AI Credits usage.");
  }
  return { status, refunded: row.refunded, available: row.available };
}

/** Refund a bounded batch of provider calls that never reached a terminal state. */
export async function recoverStaleAiUsageOperations(input: {
  before: Date;
  limit: number;
}): Promise<number> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    if (isLocalMockMode()) return 0;
    throw new Error(persistenceUnavailableMessage("AI usage recovery"));
  }

  const { data, error } = await supabase.rpc("recover_stale_ai_usage_operations", {
    p_before: input.before.toISOString(),
    p_limit: input.limit
  });
  if (error || !isAvailable(data)) {
    throw new Error("Failed to recover stale AI Credits usage.");
  }
  return data;
}