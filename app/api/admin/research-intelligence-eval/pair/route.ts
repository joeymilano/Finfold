import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { generateRequestSchema, type GenerateRequest, type KitOutput } from "@/lib/content-schema";
import { generateKitOutputs, type ModelAttemptAudit } from "@/lib/llm";
import { moderateInput } from "@/lib/moderation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  buildResearchGenerationContext,
  buildResearchWorkbenchIdea
} from "@/lib/operations/research";
import { loadOwnedResearchMission } from "@/lib/operations/research-store";
import {
  evaluateResearchIntelligencePairValidity,
  researchIntelligenceEvalCaseSchema,
  researchIntelligenceEvalPairRequestSchema
} from "@/lib/research-intelligence-eval";
import { createSupabaseAdminClient } from "@/lib/supabase";

type Arm = "control" | "treatment";

function estimatedCost(attempts: ModelAttemptAudit[]): number | null {
  const known = attempts
    .map((attempt) => attempt.estimatedCostUsd)
    .filter((value): value is number => value != null);
  return known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null;
}

async function generateArm(
  arm: Arm,
  baseInput: GenerateRequest,
  intelligenceContext: NonNullable<GenerateRequest["intelligenceContext"]>,
  modelTier: "haiku" | "sonnet" | "opus",
  attempts: ModelAttemptAudit[]
) {
  const startedAt = Date.now();
  const input = arm === "treatment"
    ? { ...baseInput, intelligenceContext }
    : baseInput;
  const outputs = await generateKitOutputs(input, {
    modelTier,
    // This experiment must stay stateless. A persistent Agent's memory would
    // introduce a second variable and make the pair uninterpretable.
    allowPersistentAgentFallback: false,
    onModelAttempt: async (attempt) => {
      attempts.push(attempt);
    }
  });
  const output = outputs.find((candidate) => candidate.platform === baseInput.platforms[0]);
  if (!output) throw new Error(`The ${arm} arm did not return the requested platform.`);
  return {
    output: output as KitOutput,
    generation: {
      modelTier,
      durationMs: Date.now() - startedAt,
      attempts,
      estimatedCostUsd: estimatedCost(attempts)
    }
  };
}

export async function POST(request: Request) {
  try {
    const userId = await requireAdmin();
    if (!checkRateLimit(`research-intelligence-eval:${userId}:${getClientIp(request)}`, 10, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Research evaluation is limited to 10 pairs per hour to cap model spend." },
        { status: 429, headers: { "Retry-After": "3600" } }
      );
    }
    const input = researchIntelligenceEvalPairRequestSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Research evaluation persistence is unavailable." }, { status: 503 });
    }

    const mission = await loadOwnedResearchMission(admin, userId, input.missionId);
    if (!mission) {
      return NextResponse.json({ error: "Research mission not found." }, { status: 404 });
    }
    if (mission.status !== "ready" || !mission.decision) {
      return NextResponse.json({ error: "Finish the Research decision before evaluation." }, { status: 409 });
    }

    const intelligenceContext = buildResearchGenerationContext(mission);
    const ideaText = input.ideaText ?? buildResearchWorkbenchIdea(
      mission,
      input.language === "en" ? "en" : "zh"
    );
    const moderation = moderateInput(ideaText);
    if (moderation.flagged) {
      return NextResponse.json({ error: moderation.reason }, { status: 422 });
    }
    const baseInput = generateRequestSchema.parse({
      ideaText,
      goal: input.goal,
      persona: input.persona,
      platforms: [input.platform],
      mediaAssets: [],
      language: input.language
    });

    const treatmentFirst = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0;
    const order: Arm[] = treatmentFirst
      ? ["treatment", "control"]
      : ["control", "treatment"];
    const results = {} as Record<Arm, Awaited<ReturnType<typeof generateArm>>>;
    const armAttempts: Record<Arm, ModelAttemptAudit[]> = { control: [], treatment: [] };
    try {
      for (const arm of order) {
        results[arm] = await generateArm(
          arm,
          baseInput,
          intelligenceContext,
          input.modelTier,
          armAttempts[arm]
        );
      }
    } catch (error) {
      // A failed arm still consumed provider spend. Report every attempt that
      // already happened so the operator can account for the cost — never
      // retry silently and never fall back to a template sample.
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Research evaluation arm failed.",
          failedCall: {
            occurredAt: new Date().toISOString(),
            missionId: mission.id,
            stage: "pair generation",
            error: error instanceof Error ? error.message : "Research evaluation arm failed.",
            attempts: {
              control: armAttempts.control,
              treatment: armAttempts.treatment
            },
            estimatedCostUsd: estimatedCost([...armAttempts.control, ...armAttempts.treatment])
          }
        },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const pairValidity = evaluateResearchIntelligencePairValidity({
      control: { generation: results.control.generation },
      treatment: { generation: results.treatment.generation }
    });
    const evaluationCase = researchIntelligenceEvalCaseSchema.parse({
      id: crypto.randomUUID(),
      missionId: mission.id,
      createdAt: new Date().toISOString(),
      brief: {
        ideaText,
        goal: input.goal,
        persona: input.persona,
        platform: input.platform,
        language: input.language
      },
      intelligenceContext,
      control: results.control,
      treatment: results.treatment,
      pairValidity
    });
    return NextResponse.json(
      { evaluationCase, generatedOrder: order },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "Forbidden") {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Please log in." }, { status: 401 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Research evaluation failed." }, { status: 400 });
  }
}
