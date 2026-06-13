export const runtime = "edge";

import { NextResponse } from "next/server";
import { atomizeContent, atomizerRequestSchema } from "@/lib/atomizer";
import { getCurrentUserId } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    await getCurrentUserId();
    const input = atomizerRequestSchema.parse(await request.json());
    const kit = atomizeContent(input);

    return NextResponse.json({ kit });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to atomize content." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to atomize content." },
      { status: 400 }
    );
  }
}
