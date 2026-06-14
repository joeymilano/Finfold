/**
 * POST /api/image/generate
 *
 * Generate a cover image for a content kit output.
 * Uses the Agnes AI image generation API (OpenAI-compatible).
 *
 * Expected body: {
 *   prompt: string;
 *   platform?: string;
 *   size?: string;
 * }
 *
 * Returns: { url: string; revisedPrompt: string | null }
 */

import { NextResponse } from "next/server";
import { generateImage, isImageGenConfigured } from "@/lib/image-gen";

export const runtime = "edge";

export async function POST(request: Request) {
  if (!isImageGenConfigured()) {
    return NextResponse.json(
      { error: "Image generation is not configured. Set IMAGE_API_KEY." },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as {
      prompt?: string;
      platform?: string;
      size?: string;
    };

    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json(
        { error: "Missing prompt." },
        { status: 400 }
      );
    }

    // Validate size parameter
    const allowedSizes = ["1024x1024", "768x1344", "864x1152", "1344x768", "1152x864", "1440x720", "720x1440"];
    const size = body.size && allowedSizes.includes(body.size) ? body.size : "1024x1024";

    const result = await generateImage(prompt, size);

    return NextResponse.json({
      url: result.url,
      revisedPrompt: result.revisedPrompt,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[Image API] Generation failed:", detail);
    return NextResponse.json(
      { error: `Image generation failed: ${detail}` },
      { status: 500 }
    );
  }
}
