export const runtime = "edge";

import { NextResponse } from "next/server";
import type { MediaAsset } from "@/lib/content-schema";
import { getCurrentUserId } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    await getCurrentUserId();
    const formData = await request.formData();
    const files = formData.getAll("files").filter((file): file is File => file instanceof File);
    const assets: MediaAsset[] = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type.startsWith("video") ? "video" : "image"
    }));

    return NextResponse.json({ assets });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process media." },
      { status: 400 }
    );
  }
}
