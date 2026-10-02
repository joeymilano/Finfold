import { NextResponse } from "next/server";
import { apiError } from "@/lib/i18n";
import {
  AGENT_ATTACHMENT_MAX_FILES,
  AGENT_ATTACHMENT_MAX_FILE_BYTES,
  AGENT_ATTACHMENT_MAX_TOTAL_BYTES,
  AGENT_ATTACHMENT_MIME_TYPES,
  getAgentAttachmentRule,
  matchesAgentAttachmentSignature,
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
      return NextResponse.json({ error: apiError(request.headers, "附件存储暂不可用。", "Private attachment storage is unavailable.") }, { status: 503 });
    }

    const formData = await parseBoundedFormData(request, MEDIA_MULTIPART_MAX_BYTES);
    const entries = Array.from(formData.entries());
    if (entries.some(([name, value]) => name !== "files" || !(value instanceof File))) {
      return NextResponse.json({ error: apiError(request.headers, "附件请求包含不支持的字段。", "The attachment request contains unsupported fields.") }, { status: 400 });
    }
    const files = entries.map(([, value]) => value as File);
    if (!files.length) return NextResponse.json({ attachments: [] });
    if (files.length > AGENT_ATTACHMENT_MAX_FILES) {
      return NextResponse.json({ error: apiError(request.headers, `一次最多上传 ${AGENT_ATTACHMENT_MAX_FILES} 个文件。`, `Upload at most ${AGENT_ATTACHMENT_MAX_FILES} files at a time.`) }, { status: 400 });
    }
    if (files.reduce((sum, file) => sum + file.size, 0) > AGENT_ATTACHMENT_MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: apiError(request.headers, "附件总大小超过 25MB。", "The combined upload exceeds 25MB.") }, { status: 400 });
    }

    const validated: Array<{
      file: File;
      kind: AgentAttachment["kind"];
      contentType: string;
      extension: string;
    }> = [];

    for (const file of files) {
      if (file.size > AGENT_ATTACHMENT_MAX_FILE_BYTES) {
        return NextResponse.json({ error: apiError(request.headers, `“${file.name}”超过 25MB 上限。`, `“${file.name}” exceeds the 25MB limit.`) }, { status: 400 });
      }
      const rule = getAgentAttachmentRule(file);
      if (!rule) {
        return NextResponse.json({ error: apiError(request.headers, `“${file.name}”不是支持的图片、视频、PDF、Office、文本或数据文件。`, `“${file.name}” is not a supported image, video, PDF, Office, text, or data file.`) }, { status: 400 });
      }
      const header = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
      const contentType = rule.mimeTypes[0];
      if (rule.kind === "image") {
        const inspection = await inspectMediaUpload(file);
        if (!inspection.ok) {
          return NextResponse.json({ error: apiError(request.headers, `“${file.name}”不是有效的图片文件。`, `“${file.name}” is not a valid supported image.`) }, { status: 400 });
        }
      } else if (!matchesAgentAttachmentSignature(rule.kind, file.name, header)) {
        return NextResponse.json({ error: apiError(request.headers, `“${file.name}”内容与文件类型不符。`, `“${file.name}” does not match its file type.`) }, { status: 400 });
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
      return NextResponse.json({ error: apiError(request.headers, "附件上传超过 27MB 请求上限。", "The attachment upload exceeds the 27MB request limit.") }, { status: 413 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "登录后才能上传附件。", "Please log in to add attachments.") }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : apiError(request.headers, "附件上传失败。", "Attachment upload failed.") }, { status: 400 });
  }
}

async function ensurePrivateBucket(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>) {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) {
    const existingMimeTypes = new Set(data.allowed_mime_types ?? []);
    const needsUpdate = data.public
      || data.file_size_limit !== AGENT_ATTACHMENT_MAX_FILE_BYTES
      || AGENT_ATTACHMENT_MIME_TYPES.some((mimeType) => !existingMimeTypes.has(mimeType));
    if (!needsUpdate) return;
    const { error } = await admin.storage.updateBucket(BUCKET, {
      public: false,
      fileSizeLimit: AGENT_ATTACHMENT_MAX_FILE_BYTES,
      allowedMimeTypes: AGENT_ATTACHMENT_MIME_TYPES
    });
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: AGENT_ATTACHMENT_MAX_FILE_BYTES,
    allowedMimeTypes: AGENT_ATTACHMENT_MIME_TYPES
  });
  if (error && !error.message.toLowerCase().includes("already exists")) throw new Error(error.message);
}
