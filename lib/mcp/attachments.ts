import type { MediaAsset } from "@/lib/content-schema";
import {
  buildAttachmentEvidenceContext,
  extractAgentAttachmentContent,
  type AttachmentExtraction
} from "@/lib/agent/attachment-content";
import {
  getAgentAttachmentRule,
  matchesAgentAttachmentSignature,
  type AgentAttachment
} from "@/lib/agent/attachments";
import type { McpAttachmentInput } from "@/lib/mcp/types";
import { inspectMediaUploadBytes } from "@/lib/media-upload-policy";
import { readBytesWithLimit, safeExternalFetch } from "@/lib/safe-url";

const MAX_INLINE_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_REMOTE_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type ResolvedMcpAttachments = {
  context: string;
  mediaAssets: MediaAsset[];
  names: string[];
};

/**
 * MCP has no browser file picker, so clients may provide either a public or
 * signed HTTPS URL, or raw Base64 bytes. Both paths are bounded, signature
 * checked, and run through the same extractors as Finfold Agent/Workbench.
 */
export async function resolveMcpAttachments(
  inputs: McpAttachmentInput[]
): Promise<ResolvedMcpAttachments> {
  const extractions: AttachmentExtraction[] = [];
  const mediaAssets: MediaAsset[] = [];
  let totalBytes = 0;

  for (const input of inputs) {
    const rule = getAgentAttachmentRule({ name: input.name, type: input.mimeType });
    if (!rule) {
      throw new Error(`“${input.name}” is not a supported video, image, PDF, DOCX, PPTX, XLSX, text, or data file.`);
    }

    const bytes = input.dataBase64
      ? decodeBase64(input.dataBase64, input.name)
      : await fetchRemoteAttachment(input);
    const perFileLimit = input.dataBase64 ? MAX_INLINE_ATTACHMENT_BYTES : MAX_REMOTE_ATTACHMENT_BYTES;
    if (bytes.byteLength > perFileLimit) {
      throw new Error(`“${input.name}” exceeds the ${Math.round(perFileLimit / (1024 * 1024))}MB ${input.dataBase64 ? "inline" : "remote"} attachment limit.`);
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new Error("MCP attachments exceed the 25MB combined limit.");
    }

    const canonicalMimeType = rule.mimeTypes[0];
    validateAttachmentBytes(input.name, rule.kind, canonicalMimeType, bytes);
    const id = crypto.randomUUID();
    const attachment: AgentAttachment = {
      id,
      name: input.name,
      size: bytes.byteLength,
      kind: rule.kind,
      mimeType: canonicalMimeType,
      storagePath: `mcp/${id}.${input.name.split(".").pop()?.toLowerCase() ?? "bin"}`
    };

    if (rule.kind === "image" || rule.kind === "video") {
      // OpenAI-compatible multimodal providers accept local media as a data
      // URL. Keeping the MIME prefix is required by Qwen for video_url input.
      const url = input.url ?? `data:${canonicalMimeType};base64,${input.dataBase64}`;
      mediaAssets.push({ id, name: input.name, size: bytes.byteLength, type: rule.kind, url });
      extractions.push({ attachment: { ...attachment, url }, text: null, truncated: false, status: "visual" });
      continue;
    }

    try {
      extractions.push(await extractAgentAttachmentContent(attachment, bytes));
    } catch (error) {
      throw new Error(`Finfold could not read “${input.name}”: ${error instanceof Error ? error.message : "content extraction failed"}`);
    }
  }

  return {
    context: buildAttachmentEvidenceContext(extractions),
    mediaAssets,
    names: inputs.map((input) => input.name)
  };
}

async function fetchRemoteAttachment(input: McpAttachmentInput): Promise<Uint8Array> {
  if (!input.url) throw new Error(`“${input.name}” is missing attachment data.`);
  const response = await safeExternalFetch(
    input.url,
    { headers: { Accept: `${input.mimeType},application/octet-stream;q=0.8` } },
    {
      timeoutMs: 15_000,
      maxRedirects: 3,
      allowedContentTypes: [input.mimeType, "application/octet-stream"],
      auditPurpose: "mcp_attachment"
    }
  );
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Could not download “${input.name}” (HTTP ${response.status}).`);
  }
  return readBytesWithLimit(response, MAX_REMOTE_ATTACHMENT_BYTES);
}

function decodeBase64(value: string, name: string): Uint8Array {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error(`“${name}” contains invalid Base64 data.`);
  }
  if (Math.floor(normalized.length * 0.75) > MAX_INLINE_ATTACHMENT_BYTES + 2) {
    throw new Error(`“${name}” exceeds the 8MB inline attachment limit.`);
  }
  try {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw new Error(`“${name}” contains invalid Base64 data.`);
  }
}

function validateAttachmentBytes(
  name: string,
  kind: AgentAttachment["kind"],
  mimeType: string,
  bytes: Uint8Array
): void {
  if (kind === "image") {
    const inspection = inspectMediaUploadBytes(bytes);
    if (!inspection.ok || inspection.contentType !== mimeType) {
      throw new Error(`“${name}” does not contain a valid supported image.`);
    }
    return;
  }
  if (!matchesAgentAttachmentSignature(kind, name, bytes.slice(0, 512 * 1024))) {
    throw new Error(`“${name}” does not match its declared file type.`);
  }
}
