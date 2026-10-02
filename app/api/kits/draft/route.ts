
import { NextResponse } from "next/server";
import { z } from "zod";
import { detectLocaleFromHeaders, type Locale } from "@/lib/i18n";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { persistGeneratedKit } from "@/lib/kit-persistence";
import { platformIdSchema, type ContentKit } from "@/lib/content-schema";

const draftRequestSchema = z.object({
  text: z.string().min(10).max(8000),
  platform: platformIdSchema.default("xiaohongshu"),
  source: z.enum(["agent_rewrite"]).default("agent_rewrite")
});

function draftTitle(text: string, locale: Locale): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? (locale === "en" ? "Untitled draft" : "未命名草稿");
  return firstLine.length <= 24 ? firstLine : `${firstLine.slice(0, 24)}…`;
}

/**
 * Saves an agent-side rewrite (or similar short copy) as a draft content kit
 * so the result survives the conversation. The user can resume it in the
 * workbench or content library like any other kit.
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const supabase = createSupabaseAdminClient();
    if (!supabase && !isLocalMockMode()) {
      return NextResponse.json({ error: persistenceUnavailableMessage("Content library") }, { status: 503 });
    }

    const body = await request.json().catch(() => null);
    const parsed = draftRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Draft text is required (10-8000 characters)." }, { status: 400 });
    }
    const { text, platform } = parsed.data;
    const locale = detectLocaleFromHeaders(request.headers);
    const draftDefaults = locale === "en"
      ? { cta: "To be added", notes: "Draft saved from a Finfold Agent rewrite", strategy: "To be added" }
      : { cta: "待补充", notes: "由 Finfold智能体改写结果保存的草稿", strategy: "待补充" };

    const kit: ContentKit = {
      id: crypto.randomUUID(),
      ideaText: text,
      goal: "lead-gen",
      persona: "ai-saas",
      platforms: [platform],
      mediaAssets: [],
      outputs: [
        {
          platform,
          title: draftTitle(text, locale),
          body: text,
          ...draftDefaults,
          locked: false,
          publishStatus: "draft",
          userEdited: false
        }
      ],
      status: "saved",
      createdAt: new Date().toISOString()
    };

    await persistGeneratedKit(userId, kit);

    return NextResponse.json({ kitId: kit.id });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to save drafts." }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save draft." },
      { status: 400 }
    );
  }
}
