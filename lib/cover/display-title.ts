import type { PlatformId } from "@/lib/platforms";

/**
 * Adds an intentional display line-break without changing any characters.
 * Chinese Xiaohongshu titles read more like designed headlines when the
 * payoff gets its own line; English and already-art-directed titles stay put.
 */
export function formatCoverDisplayTitle(title: string, platform: PlatformId): string {
  const trimmed = title.trim();
  if (platform !== "xiaohongshu" || trimmed.includes("\n") || !/[\u3400-\u9fff]/.test(trimmed)) {
    return trimmed;
  }

  const characters = Array.from(trimmed);
  if (characters.length <= 8) return trimmed;

  const payoffLength = characters.length <= 12 ? 3 : Math.min(6, Math.max(4, Math.round(characters.length * 0.34)));
  const splitAt = characters.length - payoffLength;
  return `${characters.slice(0, splitAt).join("")}\n${characters.slice(splitAt).join("")}`;
}
