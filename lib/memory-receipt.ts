import type { FeedbackReason } from "@/lib/output-feedback";
import type { PlatformId } from "@/lib/platforms";

export type MemoryReceiptItem = {
  kind: "style_rule" | "approved_example" | "feedback_rule";
  source: "edit" | "feedback" | "publish";
  value: string;
  outputId?: string;
  platform?: PlatformId;
  reasonCode?: FeedbackReason;
};

export function memoryExcerpt(value: string, limit = 96): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}
