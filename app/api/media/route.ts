export const runtime = "edge";

import { NextResponse } from "next/server";
import type { MediaAsset } from "@/lib/content-schema";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB per file
const MEDIA_BUCKET = "media";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const formData = await request.formData();
    const files = formData.getAll("files").filter((file): file is File => file instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ assets: [] });
    }

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `"${file.name}" exceeds the 25MB limit.` },
          { status: 400 }
        );
      }
    }

    const admin = createSupabaseAdminClient();

    // Without storage configured, fall back to metadata-only assets so the
    // picker still works locally (files are not persisted in that case).
    if (!admin) {
      const assets: MediaAsset[] = files.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type.startsWith("video") ? "video" : "image"
      }));
      return NextResponse.json({ assets, persisted: false });
    }

    const assets: MediaAsset[] = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      const ext = file.name.includes(".") ? file.name.split(".").pop() : undefined;
      const path = ext ? `${userId}/${id}.${ext}` : `${userId}/${id}`;
      const arrayBuffer = await file.arrayBuffer();

      const { error: uploadError } = await admin.storage
        .from(MEDIA_BUCKET)
        .upload(path, arrayBuffer, {
          upsert: true,
          contentType: file.type || "application/octet-stream"
        });

      if (uploadError) {
        const msg = uploadError.message;
        if (msg.includes("Bucket not found") || msg.toLowerCase().includes("bucket")) {
          return NextResponse.json(
            { error: "Please create a public 'media' bucket in Supabase → Storage first." },
            { status: 400 }
          );
        }
        return NextResponse.json({ error: msg || "Upload failed." }, { status: 400 });
      }

      const { data: urlData } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);

      assets.push({
        id,
        name: file.name,
        size: file.size,
        type: file.type.startsWith("video") ? "video" : "image",
        url: urlData.publicUrl
      });
    }

    return NextResponse.json({ assets, persisted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to upload media." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process media." },
      { status: 400 }
    );
  }
}
