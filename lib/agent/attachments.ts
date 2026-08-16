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
  { extensions: ["doc"], mimeTypes: ["application/msword"], kind: "document" as const },
  { extensions: ["docx"], mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], kind: "document" as const },
  { extensions: ["ppt"], mimeTypes: ["application/vnd.ms-powerpoint"], kind: "document" as const },
  { extensions: ["pptx"], mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"], kind: "document" as const },
  { extensions: ["xls"], mimeTypes: ["application/vnd.ms-excel"], kind: "data" as const },
  { extensions: ["xlsx"], mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], kind: "data" as const },
  { extensions: ["csv"], mimeTypes: ["text/csv", "application/csv", "application/vnd.ms-excel"], kind: "data" as const },
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

export function formatAgentAttachmentSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}
