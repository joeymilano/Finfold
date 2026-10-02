import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { ACTION_CREDITS } from "@/lib/payment/types";
import { generateLeadToolSpec } from "@/lib/lead-tools/generate";
import { createLeadTool } from "@/lib/lead-tools/service";

const generateBodySchema = z.object({
  businessIntro: z.string().trim().min(20).max(4000),
  businessName: z.string().trim().max(60).optional(),
  entryUrl: z.string().trim().max(500).optional(),
  entryLabel: z.string().trim().max(40).optional(),
  entryHint: z.string().trim().max(120).optional()
});

/**
 * Turns a business introduction into a draft lead tool. Charges the normal
 * ACTION_CREDITS.leadToolGenerate via the three-phase billing helper:
 * a provider failure refunds, an uncertain outcome stays held for
 * reconciliation instead of double-charging on retry.
 */
export async function POST(request: Request) {
  const limited = enforceApiRateLimit(request, { scope: "lead-tools-generate", limit: 6, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Lead tools unavailable." }, { status: 503 });

    const body = generateBodySchema.parse(await request.json());
    const operationKey = `lead_tool_generate:${crypto.randomUUID()}`;
    const billing = createAiUsageBilling({
      operationKey,
      userId,
      action: "lead_tool_generate",
      cost: ACTION_CREDITS.leadToolGenerate,
      source: "lead_tools",
      detail: { introLength: body.businessIntro.length }
    });

    const reservation = await billing.reserveAndStart();
    if (reservation.outcome === "insufficient_credits") {
      return NextResponse.json(
        { error: "Insufficient credits.", code: "INSUFFICIENT_CREDITS", available: reservation.available, needed: ACTION_CREDITS.leadToolGenerate },
        { status: 402 }
      );
    }
    if (reservation.outcome === "existing") {
      // An earlier attempt of this operation is still reconciling; do not
      // run (and charge) a second provider call behind its back.
      return NextResponse.json({ error: "A generation is still settling. Retry in a moment." }, { status: 409 });
    }

    let tool;
    try {
      const spec = await generateLeadToolSpec(body);
      await billing.settle();
      tool = await createLeadTool(admin, userId, {
        title: spec.title,
        businessContext: body.businessIntro,
        spec,
        note: "AI 生成"
      });
    } catch (error) {
      await billing.refund("lead_tool_generate_failed").catch(() => undefined);
      throw error;
    }

    return NextResponse.json({ tool }, { status: 201 });
  } catch (error) {
    const unauth = error instanceof Error && error.message === "Unauthorized";
    const invalid = error instanceof Error && error.name === "ZodError";
    return NextResponse.json(
      {
        error: unauth
          ? "Please log in."
          : invalid
            ? "请填写至少 20 字的业务介绍。"
            : "生成没有成功，这次不扣点数。请稍后重试。"
      },
      { status: unauth ? 401 : invalid ? 422 : 502 }
    );
  }
}
