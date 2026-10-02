import { NextResponse } from "next/server";
import { verifyInternalWorkerRequest } from "@/lib/internal-worker-auth";
import { runCreditReconciliation } from "@/lib/payment/reconciliation";
import { recoverStaleAiUsageOperations } from "@/lib/payment";

const AI_USAGE_OPERATION_STALE_AFTER_MS = 30 * 60 * 1000;
const AI_USAGE_OPERATION_RECOVERY_LIMIT = 100;

export async function POST(request: Request) {
  if (!(await verifyInternalWorkerRequest(request))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  try {
    const [result, staleAiUsageOperationsRefunded] = await Promise.all([
      runCreditReconciliation(),
      recoverStaleAiUsageOperations({
        before: new Date(Date.now() - AI_USAGE_OPERATION_STALE_AFTER_MS),
        limit: AI_USAGE_OPERATION_RECOVERY_LIMIT
      })
    ]);
    const response = { ...result, staleAiUsageOperationsRefunded };
    if (result.issueCount > 0) {
      console.error(
        JSON.stringify({
          event: "credit_reconciliation_discrepancy",
          ...response
        })
      );
    } else {
      console.log(
        JSON.stringify({ event: "credit_reconciliation_completed", ...response })
      );
    }
    return NextResponse.json({ ok: true, ...response });
  } catch (error) {
    console.error("[credits-reconcile] scheduled run failed:", error);
    return NextResponse.json(
      { error: "Credits reconciliation failed." },
      { status: 503 }
    );
  }
}
