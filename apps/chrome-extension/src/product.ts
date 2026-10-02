import type { Platform } from "./types";

export function generationIntent(pageUrl: string, platforms: Platform[]): string {
  return `${pageUrl}\n${platforms.join(",")}`;
}

export function sourceMetric(text: string, chinese: boolean): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  if (chinese) return normalized.replace(/\s/g, "").length;
  return normalized.split(/\s+/).filter(Boolean).length;
}

export function completeResultLength(result: { title: string; body: string; cta: string }): number {
  return [result.title, result.body, result.cta].filter(Boolean).join("\n\n").length;
}

export function shouldRetainRequestId(cause: unknown): boolean {
  if (!(cause instanceof Error)) return true;
  if (cause instanceof TypeError || cause.name === "AbortError") return true;
  return cause.message === "REQUEST_IN_PROGRESS" || /^HTTP_(408|429|5\d\d)$/.test(cause.message);
}
