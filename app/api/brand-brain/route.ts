export const runtime = "edge";

import { NextResponse } from "next/server";
import { brandBrainSchema } from "@/lib/brand-brain";
import { mapBrandBrainFromRow, mapBrandBrainToRow } from "@/lib/brand-brain-persistence";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ brain: brandBrainSchema.parse({}), persisted: false });
    }

    const { data, error } = await supabase
      .from("brand_brains")
      .select("brand_name, product_description, target_audience, tone_keywords, banned_phrases, approved_examples, competitors, positioning_statement")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ brain: mapBrandBrainFromRow(data), persisted: Boolean(data) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to load Brand Brain." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Brand Brain." },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = brandBrainSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ brain: input, persisted: false });
    }

    const { data, error } = await supabase
      .from("brand_brains")
      .upsert(
        {
          user_id: userId,
          ...mapBrandBrainToRow(input),
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("brand_name, product_description, target_audience, tone_keywords, banned_phrases, approved_examples, competitors, positioning_statement")
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ brain: mapBrandBrainFromRow(data), persisted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to save Brand Brain." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save Brand Brain." },
      { status: 400 }
    );
  }
}
