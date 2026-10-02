
import { NextResponse } from "next/server";
import { getFounderAccess } from "@/lib/founder-access";
import { generateActivationCodes, seedCohortRequestSchema } from "@/lib/seed-cohorts";
import { createSupabaseAdminClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const access = await getFounderAccess();
  if (!access.authenticated) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!access.authorized || !access.userId) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Seed cohorts are not configured." }, { status: 503 });

  try {
    const input = seedCohortRequestSchema.parse(await request.json());
    const codes = generateActivationCodes(input.count);
    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { error } = await admin.from("activation_codes").insert(codes.map((code) => ({
      code,
      plan: input.plan,
      duration_days: input.durationDays,
      expires_at: expiresAt,
      batch_label: input.batchLabel,
      created_by: access.userId
    })));
    if (error) throw error;

    return NextResponse.json({
      cohort: {
        batchLabel: input.batchLabel,
        plan: input.plan,
        durationDays: input.durationDays,
        expiresAt,
        codes
      }
    });
  } catch (error) {
    console.error("[founder/seed-cohorts] create failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create seed cohort." }, { status: 400 });
  }
}
