import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { restoreLeadToolVersion, setLeadToolStatus } from "@/lib/lead-tools/service";

const ACTIONS = new Set(["publish", "pause", "resume", "archive", "restore_version"]);

/**
 * Status transitions and version restores. Publishing re-validates the
 * draft against the stricter publish gate (entry URLs filled, bands
 * contiguous) and pins the snapshot — the live page never serves an
 * unreviewed edit.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Lead tools unavailable." }, { status: 503 });
    const { id } = await params;

    const body = await request.json();
    const action = String(body?.action ?? "");
    if (!ACTIONS.has(action)) {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    if (action === "restore_version") {
      const versionId = String(body?.versionId ?? "");
      if (!versionId) return NextResponse.json({ error: "versionId is required." }, { status: 400 });
      const tool = await restoreLeadToolVersion(admin, userId, id, versionId);
      return NextResponse.json({ tool });
    }

    const tool = await setLeadToolStatus(admin, userId, id, action as "publish" | "pause" | "resume" | "archive");
    return NextResponse.json({ tool });
  } catch (error) {
    const unauth = error instanceof Error && error.message === "Unauthorized";
    const invalid = error instanceof Error && (error.message.startsWith("结果「") || error.message.startsWith("入口「"));
    return NextResponse.json(
      {
        error: unauth
          ? "Please log in."
          : invalid
            ? (error as Error).message
            : "Lead tools are temporarily unavailable."
      },
      { status: unauth ? 401 : invalid ? 422 : 503 }
    );
  }
}
