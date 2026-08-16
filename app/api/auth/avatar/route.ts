
import { NextResponse } from "next/server";
import {
  AVATAR_MULTIPART_MAX_BYTES,
  parseBoundedFormData,
  RequestBodyTooLargeError
} from "@/lib/bounded-form-data";
import { inspectMediaUpload, MAX_MEDIA_DECODED_PIXELS } from "@/lib/media-upload-policy";
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

  let formData: FormData;
  try {
    formData = await parseBoundedFormData(request, AVATAR_MULTIPART_MAX_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "Avatar upload request is too large (max 3MB including multipart framing)." },
        { status: 413 }
      );
    }
    throw error;
  }
  const file = formData.get("file");
  const userId = formData.get("userId") as string | null;

  if (!(file instanceof File)) {
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

  const inspection = await inspectMediaUpload(file);
  if (!inspection.ok) {
    if (inspection.code === "pixel_limit") {
      return NextResponse.json(
        {
          error: `Avatar exceeds the ${MAX_MEDIA_DECODED_PIXELS / 1_000_000}-megapixel decoded image limit (${inspection.width}×${inspection.height}).`
        },
        { status: 400 }
      );
    }
    if (inspection.code === "animated_image") {
      return NextResponse.json(
        { error: "Animated avatars are not supported." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Avatar must be a supported JPEG, PNG, or WebP image within the structural limits." },
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

  const ext = inspection.contentType === "image/jpeg" ? "jpg" : inspection.contentType.split("/")[1];
  // A versioned path makes rollback safe. Upserting a fixed avatar path would
  // overwrite the previous object before metadata is durable; deleting that
  // path on a later failure would then destroy the user's last good avatar.
  const path = `${userId}/avatar-${crypto.randomUUID()}.${ext}`;
  const previousAvatarUrl =
    typeof authUser.user_metadata?.avatar_url === "string"
      ? authUser.user_metadata.avatar_url
      : null;

  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, arrayBuffer, {
      upsert: true,
      contentType: inspection.contentType,
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

  try {
    const { data: urlData } = admin.storage.from("avatars").getPublicUrl(path);
    // Bust cache so the browser re-fetches
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    // Update user metadata with the new avatar URL
    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: publicUrl },
    });

    if (!updateError) {
      await removePreviousAvatarAfterSuccess(
        admin,
        previousAvatarUrl,
        userId,
        path
      );
      return NextResponse.json({ avatarUrl: publicUrl });
    }

    await removeAvatarAfterFailure(admin, path);
    return NextResponse.json(
      { error: updateError.message || "Failed to update avatar." },
      { status: 400 }
    );
  } catch (error) {
    await removeAvatarAfterFailure(admin, path);
    throw error;
  }
}

async function removePreviousAvatarAfterSuccess(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  previousAvatarUrl: string | null,
  userId: string,
  currentPath: string
): Promise<void> {
  const previousPath = ownedAvatarPath(previousAvatarUrl, userId);
  if (!previousPath || previousPath === currentPath) return;
  await removeAvatarAfterFailure(admin, previousPath);
}

function ownedAvatarPath(value: string | null, userId: string): string | null {
  if (!value) return null;
  try {
    const marker = "/storage/v1/object/public/avatars/";
    const pathname = new URL(value).pathname;
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const encodedPath = pathname.slice(markerIndex + marker.length);
    const path = encodedPath
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
    return path.startsWith(`${userId}/`) ? path : null;
  } catch {
    return null;
  }
}

async function removeAvatarAfterFailure(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  path: string
): Promise<void> {
  try {
    const { error } = await admin.storage.from("avatars").remove([path]);
    if (error) console.error("[auth/avatar] Uploaded object cleanup failed.");
  } catch (error) {
    console.error(
      "[auth/avatar] Uploaded object cleanup threw:",
      error instanceof Error ? error.name : "UnknownError"
    );
  }
}
