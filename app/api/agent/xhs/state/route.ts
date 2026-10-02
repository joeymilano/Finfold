
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/i18n";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { emptyXhsWorkflowState, loadXhsWorkflowState } from "@/lib/agent/xhs-workflow";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const searchParams = new URL(request.url).searchParams;
    const locale = searchParams.get("locale") === "en" ? "en" : "zh";
    const workflowId = z.string().uuid().optional().parse(searchParams.get("workflowId") ?? undefined);
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) return NextResponse.json({ state: emptyXhsWorkflowState(locale) });
      return NextResponse.json({ error: persistenceUnavailableMessage("Xiaohongshu Agent workflow") }, { status: 503 });
    }
    const state = await loadXhsWorkflowState(admin, userId, locale, workflowId);
    if (workflowId && state.workflow?.id !== workflowId) {
      return NextResponse.json({ error: "Xiaohongshu workflow not found." }, { status: 404 });
    }
    return NextResponse.json({ state });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "登录后才能使用小红书智能体。", "Please log in to use the Xiaohongshu Agent.") }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : apiError(request.headers, "暂时无法加载小红书工作流。", "Unable to load the Xiaohongshu workflow.") },
      { status: 400 }
    );
  }
}
