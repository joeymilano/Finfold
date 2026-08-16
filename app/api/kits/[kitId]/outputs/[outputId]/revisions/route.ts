
import { NextResponse } from "next/server";
import { getCurrentUserId, createSupabaseAdminClient } from "@/lib/supabase";

export type OutputRevision = {
  body: string;
  at: string | null;
  isCurrent: boolean;
};

/**
 * 最近 3 版正文（P0-3 历史版本切换）。从 output_edits 的 before/after 链 + 当前行
 * body/final_body 还原出现过的版本，按时间倒序、内容去重，最多 3 条。
 *
 * output_edits 在每次手编（PUT output）和单平台重生（regenerate）时各写一行，
 * 所以一条 output 的正文历史 = 当前 body ＋ 各次编辑的 before_text 倒推。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kitId: string; outputId: string }> }
) {
  try {
    const userId = await getCurrentUserId();
    const { kitId, outputId } = await params;

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Not available in this environment." }, { status: 503 });
    }

    // scope check + 当前行正文。
    const { data: output, error: outputError } = await admin
      .from("kit_outputs")
      .select("id, body, final_body")
      .eq("id", outputId)
      .eq("kit_id", kitId)
      .eq("user_id", userId)
      .maybeSingle();
    if (outputError) throw new Error("Failed to load the output.");
    if (!output) return NextResponse.json({ error: "Output not found." }, { status: 404 });

    // 最近 10 条 body 编辑记录（取最近 3 版足够）。
    const { data: edits, error: editsError } = await admin
      .from("output_edits")
      .select("before_text, after_text, created_at")
      .eq("output_id", outputId)
      .eq("field", "body")
      .order("created_at", { ascending: false })
      .limit(10);
    if (editsError) throw new Error("Failed to load edit history.");

    const currentBody = (output.final_body ?? output.body) as string;

    const revisions: OutputRevision[] = [];
    const seen = new Set<string>();
    const push = (body: string | null | undefined, at: string | null | undefined) => {
      if (!body || seen.has(body) || revisions.length >= 3) return;
      seen.add(body);
      revisions.push({ body, at: at ?? null, isCurrent: body === currentBody });
    };

    // 当前版本优先；其余从 edit 链的 before_text 倒推。
    push(currentBody, null);
    for (const edit of edits ?? []) {
      push(edit.before_text as string, (edit.created_at as string | null) ?? null);
      if (revisions.length >= 3) break;
    }

    return NextResponse.json({ revisions });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }
    console.error("[outputs/revisions] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load revisions." },
      { status: 400 }
    );
  }
}
