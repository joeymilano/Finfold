export const runtime = "edge";

import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient, hasSupabaseConfig } from "@/lib/supabase";

/**
 * POST /api/auth/avatar
 *
 * Upload a new avatar image for the current user.
 * The server handles the Supabase Storage upload and user metadata
 * update, so the secret key is never exposed to the browser.
 *
 * Expected body: FormData with "file" (image) and "userId" (string)
 */
export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Auth system not configured." },
      { status: 503 }
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Auth system not available." },
      { status: 503 }
    );
  }

  // Verify the user is authenticated
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json(
      { error: "You must be logged in to upload an avatar." },
      { status: 401 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const userId = formData.get("userId") as string | null;

  if (!file) {
    return NextResponse.json(
      { error: "No file provided." },
      { status: 400 }
    );
  }

  if (!userId || userId !== authUser.id) {
    return NextResponse.json(
      { error: "User ID mismatch." },
      { status: 400 }
    );
  }

  // Validate file
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Image must be under 2MB." },
      { status: 400 }
    );
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Please select an image file (JPG / PNG / WebP)." },
      { status: 400 }
    );
  }

  // Use the admin client for storage operations (bypasses RLS)
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Storage system not available." },
      { status: 503 }
    );
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${userId}/avatar.${ext}`;

  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, arrayBuffer, {
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    const msg = uploadError.message;
    if (msg.includes("Bucket not found") || msg.includes("bucket")) {
      return NextResponse.json(
        { error: "Please create a public 'avatars' bucket in Supabase → Storage first." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: msg || "Upload failed." },
      { status: 400 }
    );
  }

  const { data: urlData } = admin.storage.from("avatars").getPublicUrl(path);
  // Bust cache so the browser re-fetches
  const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  // Update user metadata with the new avatar URL
  const { error: updateError } = await supabase.auth.updateUser({
    data: { avatar_url: publicUrl },
  });

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || "Failed to update avatar." },
      { status: 400 }
    );
  }

  return NextResponse.json({ avatarUrl: publicUrl });
}
