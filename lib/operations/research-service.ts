import type { PlanId } from "@/lib/payment/types";
import { sendUntrustedContentPrompt } from "@/lib/llm";
import { ACTION_CREDITS, ensurePlanCredits } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { hashGenerationRequest } from "@/lib/generation-runs";
import type { AgentToolContext } from "@/lib/agent/types";
import {
  buildResearchDecisionPrompt,
  mapResearchMission,
  parseResearchDecision,
  RESEARCH_MISSION_FIELDS,
  type ResearchMission,
  type ResearchMissionInput
} from "@/lib/operations/research";

export class ResearchMissionServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ResearchMissionServiceError";
  }
}

export async function generateResearchDecisionForMission(input: {
  admin: AgentToolContext["admin"];
  userId: string;
  plan: PlanId | "free";
  missionId: string;
  mission: ResearchMissionInput;
  program: Record<string, unknown> | null;
  locale: "zh" | "en";
  billingSource: "research_center" | "agent_research";
}): Promise<ResearchMission> {
  const action = input.mission.evidence.length >= 6 ? "deepResearch" : "quickResearch";
  const fingerprint = await hashGenerationRequest({
    id: input.missionId,
    locale: input.locale,
    evidence: input.mission.evidence,
    question: input.mission.question
  });
  await ensurePlanCredits(input.userId, input.plan);
  const billing = createAiUsageBilling({
    operationKey: `research-decision:${input.userId}:${input.missionId}:${fingerprint}`,
    userId: input.userId,
    action,
    cost: ACTION_CREDITS[action],
    source: input.billingSource,
    detail: {
      missionId: input.missionId,
      evidenceCount: input.mission.evidence.length,
      inputFingerprint: fingerprint
    }
  });
  let resultReady = false;

  try {
    const reservation = await billing.reserveAndStart();
    if (reservation.outcome === "insufficient_credits") {
      throw new ResearchMissionServiceError("This workspace is out of AI Credits for this research decision.", 402);
    }
    if (reservation.outcome === "existing") {
      throw new ResearchMissionServiceError("This evidence set is already being analyzed.", 409);
    }

    const raw = await sendUntrustedContentPrompt(
      buildResearchDecisionPrompt(input.mission, input.program, input.locale)
    );
    const decision = parseResearchDecision(raw, input.mission.evidence);
    const { data: updated, error } = await input.admin
      .from("research_missions")
      .update({ decision, status: "ready", updated_at: new Date().toISOString() })
      .eq("id", input.missionId)
      .eq("user_id", input.userId)
      .select(RESEARCH_MISSION_FIELDS)
      .single();
    if (error) throw error;

    resultReady = true;
    await billing.settle();
    return mapResearchMission(updated as never);
  } catch (error) {
    if (!resultReady) await billing.refund("research_decision_failed").catch(() => undefined);
    throw error;
  }
}
