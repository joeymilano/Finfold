/**
 * POST /api/llm/generate
 *
 * Internal API route that wraps z-ai-web-dev-sdk for LLM generation.
 * This route MUST run on Node.js runtime (not edge) because the SDK
 * uses Node.js modules (fs, path, os) that are not available in edge.
 *
 * Expected body: { prompt: string }
 * Returns: { content: string }
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: string };
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json(
        { error: "Missing prompt." },
        { status: 400 }
      );
    }

    // Use z-ai-web-dev-sdk for LLM calls
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are a senior growth strategist. Return strict JSON that matches the requested schema. Do not include any text outside the JSON object."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
    });

    const content = completion.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "LLM returned an empty response." },
        { status: 500 }
      );
    }

    return NextResponse.json({ content });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[LLM API] Generation failed:", detail);
    return NextResponse.json(
      { error: `AI generation failed: ${detail}` },
      { status: 500 }
    );
  }
}
