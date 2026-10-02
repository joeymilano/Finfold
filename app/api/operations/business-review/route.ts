import { NextResponse } from "next/server";
import { loadBusinessAccountabilityReview } from "@/lib/operations/business-review";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Business accountability review requires durable storage." },
        { status: 503 }
      );
    }

    const review = await loadBusinessAccountabilityReview(admin, userId);
    return NextResponse.json({ review, persisted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Please log in to view the business accountability review." },
        { status: 401 }
      );
    }
    console.error("[business-review] unable to build review", error);
    return NextResponse.json(
      { error: "Unable to build the business accountability review." },
      { status: 500 }
    );
  }
}
