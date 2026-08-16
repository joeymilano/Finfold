import { NextResponse } from "next/server";
import {
  AGENT_ATTACHMENT_MAX_FILES,
  AGENT_ATTACHMENT_MAX_FILE_BYTES,
  AGENT_ATTACHMENT_MAX_TOTAL_BYTES,
  AGENT_ATTACHMENT_MIME_TYPES,
  getAgentAttachmentRule,
  type AgentAttachment
} from "@/lib/agent/attachments";
import {
  MEDIA_MULTIPART_MAX_BYTES,
  parseBoundedFormData,
  RequestBodyTooLargeError
} from "@/lib/bounded-form-data";
import { inspectMediaUpload } from "@/lib/media-upload-policy";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const BUCKET = "agent-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Private attachment storage is unavailable." }, { status: 503 });
    }

    const formData = await parseBoundedFormData(request, MEDIA_MULTIPART_MAX_BYTES);
    const entries = Array.from(formData.entries());
    if (entries.some(([name, value]) => name !== "files" || !(value instanceof File))) {
      return NextResponse.json({ error: "The attachment request contains unsupported fields." }, { status: 400 });
    }
    const files = entries.map(([, value]) => value as File);
    if (!files.length) return NextResponse.json({ attachments: [] });
    if (files.length > AGENT_ATTACHMENT_MAX_FILES) {
      return NextResponse.json({ error: `Upload at most ${AGENT_ATTACHMENT_MAX_FILES} files at a time.` }, { status: 400 });
    }
    if (files.reduce((sum, file) => sum + file.size, 0) > AGENT_ATTACHMENT_MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: "The combined upload exceeds 25MB." }, { status: 400 });
    }

    const validated: Array<{
      file: File;
      kind: AgentAttachment["kind"];
      contentType: string;
      extension: string;
    }> = [];

    for (const file of files) {
      if (file.size > AGENT_ATTACHMENT_MAX_FILE_BYTES) {
        return NextResponse.json({ error: `“${file.name}” exceeds the 25MB limit.` }, { status: 400 });
      }
      const rule = getAgentAttachmentRule(file);
      if (!rule) {
        return NextResponse.json({ error: `“${file.name}” is not a supported image, video, PDF, Office, text, or data file.` }, { status: 400 });
      }
      const header = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
      const contentType = rule.mimeTypes[0];
      if (rule.kind === "image") {
        const inspection = await inspectMediaUpload(file);
        if (!inspection.ok) {
          return NextResponse.json({ error: `“${file.name}” is not a valid supported image.` }, { status: 400 });
        }
      } else if (!matchesAttachmentSignature(rule.kind, file.name, header)) {
        return NextResponse.json({ error: `“${file.name}” does not match its file type.` }, { status: 400 });
      }
      validated.push({
        file,
        kind: rule.kind,
        contentType,
        extension: file.name.split(".").pop()?.toLowerCase() ?? "bin"
      });
    }

    await ensurePrivateBucket(admin);
    const uploadedPaths: string[] = [];
    const attachments: AgentAttachment[] = [];

    try {
      for (const item of validated) {
        const id = crypto.randomUUID();
        const storagePath = `${userId}/${id}.${item.extension}`;
        const { error: uploadError } = await admin.storage.from(BUCKET).upload(
          storagePath,
          await item.file.arrayBuffer(),
          { contentType: item.contentType, upsert: false }
        );
        if (uploadError) throw new Error(uploadError.message || "Attachment upload failed.");
        uploadedPaths.push(storagePath);

        const { data: signed, error: signedError } = await admin.storage
          .from(BUCKET)
          .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
        if (signedError || !signed?.signedUrl) throw new Error(signedError?.message || "Could not secure the attachment URL.");

        attachments.push({
          id,
          name: item.file.name.slice(0, 180),
          size: item.file.size,
          kind: item.kind,
          mimeType: item.contentType,
          storagePath,
          url: signed.signedUrl
        });
      }
    } catch (error) {
      if (uploadedPaths.length) await admin.storage.from(BUCKET).remove(uploadedPaths);
      throw error;
    }

    return NextResponse.json({ attachments });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "The attachment upload exceeds the 27MB request limit." }, { status: 413 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to add attachments." }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Attachment upload failed." }, { status: 400 });
  }
}

async function ensurePrivateBucket(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>) {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: AGENT_ATTACHMENT_MAX_FILE_BYTES,
    allowedMimeTypes: AGENT_ATTACHMENT_MIME_TYPES
  });
  if (error && !error.message.toLowerCase().includes("already exists")) throw new Error(error.message);
}

function matchesAttachmentSignature(kind: AgentAttachment["kind"], name: string, bytes: Uint8Array): boolean {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const startsWith = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  const ascii = (offset: number, value: string) =>
    value.split("").every((character, index) => bytes[offset + index] === character.charCodeAt(0));

  if (kind === "pdf") return ascii(0, "%PDF-");
  if (kind === "video") {
    if (extension === "webm") return startsWith([0x1a, 0x45, 0xdf, 0xa3]);
    return bytes.length >= 12 && ascii(4, "ftyp");
  }
  if (["doc", "xls", "ppt"].includes(extension)) {
    return startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
  if (["docx", "xlsx", "pptx"].includes(extension)) {
    return startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06]);
  }
  if (["txt", "md", "markdown", "csv"].includes(extension)) {
    return bytes.length === 0 || !bytes.slice(0, 4096).some((value) => value === 0);
  }
  return false;
}
