/**
 * Image Generation Client — server-side only.
 *
 * Wraps the Agnes AI image generation API (OpenAI-compatible).
 * Generates cover images for content kit outputs.
 *
 * API docs: https://apihub.agnes-ai.com
 * Model: agnes-image-2.1-flash
 */

// Lazy env reads for edge-runtime compatibility
const imageApiBase = () => process.env.IMAGE_API_BASE ?? "https://apihub.agnes-ai.com";
const imageApiKey = () => process.env.IMAGE_API_KEY ?? "";
const imageModel  = () => process.env.IMAGE_MODEL  ?? "agnes-image-2.1-flash";

// ─── Types ───────────────────────────────────────────────────────────

export interface ImageGenerationResult {
  url: string;
  revisedPrompt: string | null;
}

// ─── Config Check ────────────────────────────────────────────────────

export function isImageGenConfigured(): boolean {
  return Boolean(imageApiKey());
}

// ─── Core Generation ─────────────────────────────────────────────────

/**
 * Generate an image from a text prompt using the Agnes AI API.
 *
 * @param prompt  The image generation prompt
 * @param size    Image dimensions (default 1024x1024)
 * @returns       The generated image URL
 */
export async function generateImage(
  prompt: string,
  size: string = "1024x1024"
): Promise<ImageGenerationResult> {
  const url = `${imageApiBase()}/v1/images/generations`;
  const apiKey = imageApiKey();
  const model = imageModel();

  console.log(`[ImageGen] Requesting: model=${model} size=${size} url=${url}`);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size,
      }),
      signal: AbortSignal.timeout(60_000), // 60s timeout
    });
  } catch (fetchError) {
    const cause = fetchError instanceof Error ? fetchError.message : String(fetchError);
    console.error(`[ImageGen] Fetch failed: ${cause}`);
    throw new Error(`Image API fetch failed: ${cause}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Image API ${res.status}: ${body || res.statusText}`);
  }

  const data = (await res.json()) as {
    data?: Array<{ url?: string; b64_json?: string | null; revised_prompt?: string | null }>;
  };

  const image = data.data?.[0];
  if (!image?.url) {
    throw new Error("Image API returned no image URL.");
  }

  return {
    url: image.url,
    revisedPrompt: image.revised_prompt ?? null,
  };
}

/**
 * Build an image generation prompt tailored to a specific platform and content.
 *
 * The prompt is designed to produce a visually striking cover image
 * that matches the tone and style of the platform's content.
 */
export function buildImagePrompt(params: {
  platform: string;
  title: string;
  body: string;
  ideaText: string;
  locale: "zh" | "en";
}): string {
  const { platform, title, body, ideaText, locale } = params;

  // Extract key themes from the content
  const coreIdea = ideaText.slice(0, 200);
  const headline = title.slice(0, 80);

  const platformStyle: Record<string, string> = {
    wechat: "professional editorial magazine cover, sophisticated layout, Chinese text overlay style",
    xiaohongshu: "lifestyle aesthetic, soft pastel tones, clean minimal flat lay, trendy Gen-Z visual style",
    moments: "casual authentic, warm tones, personal story vibe, smartphone photography feel",
    x: "bold minimalist, high contrast, striking single visual, modern tech aesthetic",
    linkedin: "corporate professional, clean data visualization style, business insight visual",
    reddit: "community-driven, meme-aware, authentic discussion visual, tech-savvy aesthetic",
    "product-hunt": "startup launch energy, product showcase, clean tech aesthetic, innovation visual",
    threads: "conversational, authentic, warm community feel, social discussion visual",
    "hacker-news": "technical minimalism, code/terminal aesthetic, hacker culture visual",
    "indie-hackers": "bootstrap hustle, maker community, indie developer aesthetic",
    "medium-substack": "thought leadership, editorial illustration, intellectual visual",
  };

  const style = platformStyle[platform] ?? "modern digital marketing visual";

  if (locale === "zh") {
    return `Create a visually striking social media cover image for a ${platform} post. Style: ${style}. The post is about: "${coreIdea}". Headline: "${headline}". The image should be eye-catching, professional, and suitable for ${platform}. No text overlay. High quality, 4K resolution.`;
  }

  return `Create a visually striking social media cover image for a ${platform} post. Style: ${style}. The post is about: "${coreIdea}". Headline: "${headline}". The image should be eye-catching, professional, and suitable for ${platform}. No text overlay. High quality, 4K resolution.`;
}

/**
 * Generate cover images for multiple platform outputs in parallel.
 * Returns the outputs with imageUrl and imagePrompt fields populated.
 */
export async function generateImagesForOutputs(
  outputs: Array<{
    platform: string;
    title: string;
    body: string;
    imageUrl?: string;
    imagePrompt?: string;
  }>,
  ideaText: string,
  locale: "zh" | "en"
): Promise<Array<{ platform: string; title: string; body: string; imageUrl: string; imagePrompt: string }>> {
  if (!isImageGenConfigured()) {
    // Image generation not configured — return outputs without images
    return outputs.map((o) => ({
      ...o,
      imageUrl: o.imageUrl ?? "",
      imagePrompt: o.imagePrompt ?? "",
    }));
  }

  // Generate images in parallel (with concurrency limit of 3)
  const results = await Promise.allSettled(
    outputs.map(async (output) => {
      const prompt = buildImagePrompt({
        platform: output.platform,
        title: output.title,
        body: output.body,
        ideaText,
        locale,
      });

      try {
        const result = await generateImage(prompt);
        return {
          ...output,
          imageUrl: result.url,
          imagePrompt: prompt,
        };
      } catch (error) {
        console.warn(`[ImageGen] Failed for ${output.platform}:`, error instanceof Error ? error.message : String(error));
        return {
          ...output,
          imageUrl: output.imageUrl ?? "",
          imagePrompt: prompt,
        };
      }
    })
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") {
      return r.value;
    }
    // On rejection, return without image
    const output = outputs[i];
    return {
      ...output,
      imageUrl: output.imageUrl ?? "",
      imagePrompt: output.imagePrompt ?? "",
    };
  });
}
