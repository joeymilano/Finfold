import type { AgentToolContext } from "@/lib/agent/types";

/** Binds an Agent tool's direct provider call to the same durable Credits lifecycle as chat turns. */
export async function runAgentProviderCall<T>(
  ctx: AgentToolContext,
  invoke: () => Promise<T>
): Promise<T> {
  if (!ctx.modelTurnBilling) return invoke();
  if (!(await ctx.modelTurnBilling.reserve())) {
    throw new Error("AI Credits are unavailable for another Agent step.");
  }

  let resultReceived = false;
  try {
    const result = await invoke();
    resultReceived = true;
    await ctx.modelTurnBilling.confirmSuccessfulTurn();
    return result;
  } catch (error) {
    if (!resultReceived) await ctx.modelTurnBilling.refundFailedTurn();
    throw error;
  }
}