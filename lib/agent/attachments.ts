export type AgentAttachmentKind = "image" | "video" | "pdf" | "document" | "data";

export type AgentAttachment = {
  id: string;
  name: string;
  size: number;
  kind: AgentAttachmentKind;
  mimeType: string;
  storagePath: string;
  url?: string;
};

export const AGENT_ATTACHMENT_MAX_FILES = 6;
export const AGENT_ATTACHMENT_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const AGENT_ATTACHMENT_MAX_TOTAL_BYTES = 25 * 1024 * 1024;

const FILE_RULES = [
  { extensions: ["jpg", "jpeg"], mimeTypes: ["image/jpeg"], kind: "image" as const },
  { extensions: ["png"], mimeTypes: ["image/png"], kind: "image" as const },
  { extensions: ["webp"], mimeTypes: ["image/webp"], kind: "image" as const },
  { extensions: ["mp4"], mimeTypes: ["video/mp4"], kind: "video" as const },
  { extensions: ["mov"], mimeTypes: ["video/quicktime"], kind: "video" as const },
  { extensions: ["webm"], mimeTypes: ["video/webm"], kind: "video" as const },
  { extensions: ["pdf"], mimeTypes: ["application/pdf"], kind: "pdf" as const },
  { extensions: ["docx"], mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], kind: "document" as const },
  { extensions: ["pptx"], mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"], kind: "document" as const },
  { extensions: ["xlsx"], mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], kind: "data" as const },
  { extensions: ["csv"], mimeTypes: ["text/csv", "application/csv"], kind: "data" as const },
  { extensions: ["tsv"], mimeTypes: ["text/tab-separated-values", "text/plain"], kind: "data" as const },
  { extensions: ["json"], mimeTypes: ["application/json", "text/json", "text/plain"], kind: "data" as const },
  { extensions: ["xml"], mimeTypes: ["application/xml", "text/xml", "text/plain"], kind: "data" as const },
  { extensions: ["yaml", "yml"], mimeTypes: ["application/yaml", "application/x-yaml", "text/yaml", "text/plain"], kind: "data" as const },
  { extensions: ["txt"], mimeTypes: ["text/plain"], kind: "document" as const },
  { extensions: ["md", "markdown"], mimeTypes: ["text/markdown", "text/plain"], kind: "document" as const }
] as const;

export const AGENT_ATTACHMENT_ACCEPT = FILE_RULES
  .flatMap((rule) => rule.extensions.map((extension) => `.${extension}`))
  .join(",");

export const AGENT_ATTACHMENT_MIME_TYPES = Array.from(
  new Set(FILE_RULES.flatMap((rule) => [...rule.mimeTypes]))
);

export function getAgentAttachmentRule(file: { name: string; type?: string }) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_RULES.find((rule) =>
    rule.extensions.some((candidate) => candidate === extension) &&
    (!file.type || rule.mimeTypes.some((mimeType) => mimeType === file.type))
  );
}

export function isAcceptedAgentAttachmentFile(file: { name: string; type?: string }): boolean {
  return Boolean(getAgentAttachmentRule(file));
}

/**
 * Browser MIME values and extensions are user-controlled. Upload and MCP
 * ingestion both call this bounded signature check before treating bytes as
 * a document, archive, data file, or video.
 */
export function matchesAgentAttachmentSignature(
  kind: AgentAttachment["kind"],
  name: string,
  bytes: Uint8Array
): boolean {
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
  if (["txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml"].includes(extension)) {
    return bytes.length === 0 || !bytes.slice(0, 4096).some((value) => value === 0);
  }
  return kind === "image";
}

export function formatAgentAttachmentSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

/**
 * Pasting is one action, so it should attach one file. Some clipboards —
 * notably macOS screenshots — expose the same image in two formats at once
 * (e.g. image/tiff + image/png), which used to upload the picture twice.
 * Exact duplicates (same name + size) collapse, and when every pasted item is
 * an image only the best single representation is kept (PNG preferred).
 */
export function dedupePastedFiles<T extends { name: string; size: number; type?: string }>(files: T[]): T[] {
  const seen = new Set<string>();
  const distinct: T[] = [];
  for (const file of files) {
    const key = `${file.name}:${file.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(file);
  }
  if (distinct.length > 1 && distinct.every((file) => (file.type ?? "").startsWith("image/"))) {
    return [distinct.find((file) => file.type === "image/png") ?? distinct[0]];
  }
  return distinct;
}
