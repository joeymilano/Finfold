
import { NextResponse } from "next/server";
import { z } from "zod";
import { brandBrainSchema } from "@/lib/brand-brain";
import { BRAND_BRAIN_COLUMNS, mapBrandBrainFromRow, mapBrandBrainToRow } from "@/lib/brand-brain-persistence";
import { customGuardrailsSchema } from "@/lib/guardrails";
import { industryPackIdSchema } from "@/lib/industry-rules/types";
import { restoreXhsWorkflowAuditSnapshot } from "@/lib/agent/xhs-workflow";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const idSchema = z.string().uuid();
const guardrailsStateSchema = z.object({
  rules: customGuardrailsSchema,
  enabledPacks: z.array(industryPackIdSchema)
});

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id: rawId } = await params;
    const id = idSchema.parse(rawId);
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Undo is temporarily unavailable." }, { status: 503 });
    }

    const { data: audit, error: auditError } = await admin
      .from("agent_action_audit")
      .select("id, target_type, before_state, after_state, status")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (auditError) throw auditError;
    if (!audit) return NextResponse.json({ error: "Action not found." }, { status: 404 });
    if (audit.status !== "applied") {
      return NextResponse.json({ error: "This action has already been undone." }, { status: 409 });
    }

    if (audit.target_type === "guardrails") {
      const before = guardrailsStateSchema.parse(audit.before_state);
      const after = guardrailsStateSchema.parse(audit.after_state);
      const { data: currentRow, error: currentError } = await admin
        .from("custom_guardrails")
        .select("rules, enabled_packs")
        .eq("user_id", userId)
        .maybeSingle();
      if (currentError) throw currentError;
      const current = guardrailsStateSchema.parse({
        rules: currentRow?.rules ?? [],
        enabledPacks: currentRow?.enabled_packs ?? []
      });
      if (!sameState(current, after)) return stateChangedResponse();

      const { error } = await admin.from("custom_guardrails").upsert(
        {
          user_id: userId,
          rules: before.rules,
          enabled_packs: before.enabledPacks,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
    } else if (audit.target_type === "brand_brain") {
      const before = brandBrainSchema.parse(audit.before_state);
      const after = brandBrainSchema.parse(audit.after_state);
      const { data: currentRow, error: currentError } = await admin
        .from("brand_brains")
        .select(BRAND_BRAIN_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle();
      if (currentError) throw currentError;
      const current = mapBrandBrainFromRow(currentRow);
      if (!sameState(current, after)) return stateChangedResponse();

      const { error } = await admin.from("brand_brains").upsert(
        { user_id: userId, ...mapBrandBrainToRow(before), updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      if (error) throw error;
    } else if (audit.target_type === "xhs_workflow") {
      const restored = await restoreXhsWorkflowAuditSnapshot(
        admin,
        userId,
        audit.before_state,
        audit.after_state
      );
      if (!restored) return stateChangedResponse();
    } else {
      return NextResponse.json({ error: "This action type cannot be undone." }, { status: 400 });
    }

    const { error: markError } = await admin
      .from("agent_action_audit")
      .update({ status: "reverted", reverted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "applied");
    if (markError) throw markError;

    return NextResponse.json({ undone: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to undo this action." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to undo this action." },
      { status: 400 }
    );
  }
}

function sameState(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stateChangedResponse() {
  return NextResponse.json(
    { error: "This setting changed after the agent action, so undo was stopped to protect the newer edit." },
    { status: 409 }
  );
}
