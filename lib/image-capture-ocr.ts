import { z } from "zod";

const rawOcrOutputSchema = z.object({
  summary: z.unknown().optional(),
  keyPoints: z.unknown().optional(),
  key_points: z.unknown().optional()
}).passthrough();

export type ImageCaptureOcrResult = {
  summary: string;
  keyPoints: string[];
};

export class InvalidImageCaptureOcrResponseError extends Error {
  constructor() {
    super("The vision model returned an unusable response.");
    this.name = "InvalidImageCaptureOcrResponseError";
  }
}

/**
 * Vision providers do not all obey JSON length constraints exactly. Parse the
 * common keyPoints/key_points shapes, then enforce the UI limits ourselves so
 * one long point does not turn an otherwise useful extraction into an empty
 * result. A syntactically valid, explicit empty result remains distinguishable
 * from a malformed provider response.
 */
export function parseImageCaptureOcrResponse(raw: string): ImageCaptureOcrResult {
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const text = (fenced ? fenced[1] : raw).trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new InvalidImageCaptureOcrResponseError();
    }

    const parsed = rawOcrOutputSchema.parse(JSON.parse(text.slice(start, end + 1)));
    const hasSummary = Object.prototype.hasOwnProperty.call(parsed, "summary");
    const hasKeyPoints = Object.prototype.hasOwnProperty.call(parsed, "keyPoints")
      || Object.prototype.hasOwnProperty.call(parsed, "key_points");
    if (!hasSummary && !hasKeyPoints) throw new InvalidImageCaptureOcrResponseError();

    if (parsed.summary !== undefined && typeof parsed.summary !== "string") {
      throw new InvalidImageCaptureOcrResponseError();
    }
    const rawPoints = parsed.keyPoints ?? parsed.key_points ?? [];
    if (!Array.isArray(rawPoints) || rawPoints.some((point) => typeof point !== "string")) {
      throw new InvalidImageCaptureOcrResponseError();
    }

    const summary = truncate(String(parsed.summary ?? "").trim(), 80);
    const keyPoints = Array.from(new Set(
      rawPoints
        .map((point) => truncate(point.replace(/^[•*-]\s*/, "").trim(), 40))
        .filter(Boolean)
    )).slice(0, 6);

    return { summary, keyPoints };
  } catch (error) {
    if (error instanceof InvalidImageCaptureOcrResponseError) throw error;
    throw new InvalidImageCaptureOcrResponseError();
  }
}

function truncate(value: string, maxCharacters: number): string {
  const characters = Array.from(value);
  return characters.length <= maxCharacters
    ? value
    : characters.slice(0, maxCharacters).join("");
}
