import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-admin";
import {
  applyCreditAdjustment,
  getCreditReconciliationReport,
  runCreditReconciliation
} from "@/lib/payment/reconciliation";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run") }),
  z.object({
    action: z.literal("adjust"),
    userId: z.string().uuid(),
    delta: z.number().int(),
    reason: z.string(),
    idempotencyKey: z.string(),
    relatedGenerationRunId: z.string().uuid().nullable().optional(),
    relatedPurchaseId: z.string().uuid().nullable().optional()
  })
]);

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const runId = new URL(request.url).searchParams.get("runId");
    if (runId && !z.string().uuid().safeParse(runId).success) {
      return NextResponse.json(
        { error: "Invalid reconciliation run id." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await getCreditReconciliationReport(runId)
    );
  } catch (error) {
    return adminCreditsError(error);
  }
}

export async function POST(request: Request) {
  try {
    const operatorUserId = await requireAdmin();
    const body = actionSchema.parse(await request.json());
    if (body.action === "run") {
      const result = await runCreditReconciliation();
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await applyCreditAdjustment(operatorUserId, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return adminCreditsError(error);
  }
}

function adminCreditsError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "Forbidden") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Please log in." },
        { status: 401 }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Request failed." }, { status: 400 });
}
