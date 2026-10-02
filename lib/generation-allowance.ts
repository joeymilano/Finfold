import { getCreditAllowanceSnapshot } from "@/lib/payment/credits";
import type { PlanId } from "@/lib/payment/types";

export type TerminalGenerationAllowance = {
  used: number;
  limit: number;
  plan: PlanId | "free";
  available: number;
  costThisRun: number;
};

type TerminalGenerationAllowanceInput = {
  limit: number;
  plan: PlanId | "free";
  costThisRun: number;
};

/**
 * Builds the allowance attached to a terminal generation event only when both
 * authoritative Credits reads succeeded. Undefined is intentional: callers
 * must omit the field instead of presenting a failed read as a real 0/0.
 */
export async function getTerminalGenerationAllowance(
  userId: string,
  input: TerminalGenerationAllowanceInput
): Promise<TerminalGenerationAllowance | undefined> {
  const snapshot = await getCreditAllowanceSnapshot(userId);
  if (!snapshot) return undefined;

  return {
    used: snapshot.used,
    limit: input.limit,
    plan: input.plan,
    available: snapshot.available,
    costThisRun: input.costThisRun
  };
}
