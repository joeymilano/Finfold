
import { NextResponse } from "next/server";
import { z } from "zod";
import { customGuardrailsSchema } from "@/lib/guardrails";
import { industryPackIdSchema } from "@/lib/industry-rules/types";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";

const enabledPacksSchema = z.array(industryPackIdSchema);

// Accept both the current { rules, enabledPacks } shape and the legacy
// bare-array PUT body (pre-migration-027 clients / cached bundles), so a
// rolling deploy never 400s a client that hasn't refreshed yet.
const putBodySchema = z.union([
  z.object({ rules: customGuardrailsSchema.default([]), enabledPacks: enabledPacksSchema.default([]) }),
  customGuardrailsSchema.transform((rules) => ({ rules, enabledPacks: [] as const }))
]);

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      if (isLocalMockMode()) return NextResponse.json({ rules: [], enabledPacks: [], persisted: false });
      return NextResponse.json({ error: persistenceUnavailableMessage("Brand guardrails") }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("custom_guardrails")
      .select("rules, enabled_packs")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({
      rules: customGuardrailsSchema.parse(data?.rules ?? []),
      enabledPacks: enabledPacksSchema.parse(data?.enabled_packs ?? []),
      persisted: Boolean(data)
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to load guardrails." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load guardrails." },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const { rules, enabledPacks } = putBodySchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      if (isLocalMockMode()) return NextResponse.json({ rules, enabledPacks, persisted: false });
      return NextResponse.json({ error: persistenceUnavailableMessage("Brand guardrails") }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("custom_guardrails")
      .upsert(
        { user_id: userId, rules, enabled_packs: enabledPacks, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .select("rules, enabled_packs")
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({
      rules: customGuardrailsSchema.parse(data?.rules ?? rules),
      enabledPacks: enabledPacksSchema.parse(data?.enabled_packs ?? enabledPacks),
      persisted: true
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to save guardrails." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save guardrails." },
      { status: 400 }
    );
  }
}
