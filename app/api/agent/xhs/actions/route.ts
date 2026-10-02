
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { executeXhsPendingAction } from "@/lib/agent/xhs-workflow";
import { resolveAgentPlan } from "@/lib/agent/entitlements";
import { getPlanFeatures } from "@/lib/payment/entitlements";
import { apiError } from "@/lib/i18n";

const actionRequestSchema = z.object({
  pendingActionId: z.string().uuid(),
  selection: z.union([z.string().min(1).max(500), z.number().int().nonnegative()]).optional()
});
const actionStatusSchema = z.string().uuid();

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const pendingActionId = actionStatusSchema.parse(new URL(request.url).searchParams.get("pendingActionId"));
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Agent action status requires persistent storage." }, { status: 503 });
    }
    const { data: pending, error } = await admin
      .from("agent_pending_actions")
      .select("id, workflow_id, status, result")
      .eq("id", pendingActionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!pending) return NextResponse.json({ error: "Agent action not found." }, { status: 404 });

    const result = asRecord(pending.result);
    const auditId = stringValue(result.auditId);
    let status = String(pending.status ?? "pending");
    if (status === "executed" && auditId) {
      const { data: audit, error: auditError } = await admin
        .from("agent_action_audit")
        .select("status")
        .eq("id", auditId)
        .eq("user_id", userId)
        .maybeSingle();
      if (auditError) throw auditError;
      if (audit?.status === "reverted") status = "reverted";
    }
    const workflowId = stringValue(pending.workflow_id);
    return NextResponse.json(
      {
        status,
        auditId: auditId || null,
        completionReceipt: result.completionReceipt ?? null,
        workbenchHref: status === "executed" && workflowId
          ? `/workbench?workflowId=${encodeURIComponent(workflowId)}&platform=xiaohongshu`
          : null
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to inspect this Agent action." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to inspect this Agent action." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = actionRequestSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Agent confirmations require persistent storage." }, { status: 503 });
    }
    const plan = await resolveAgentPlan(admin, userId);
    if (!getPlanFeatures(plan).agentTools) {
      return NextResponse.json(
        { error: apiError(request.headers, "完整的小红书工作流需要 Starter 或以上套餐。", "The full Xiaohongshu workflow requires the Starter plan or above.") },
        { status: 403 }
      );
    }
    const result = await executeXhsPendingAction(admin, { userId, ...input });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to confirm this Agent action." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to confirm this Agent action." },
      { status: 400 }
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
