
import { NextResponse } from "next/server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { bugReportRequestSchema, sendBugReportEmail } from "@/lib/bug-report";
import { captureServerEvent } from "@/lib/posthog-server";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const rateLimited = enforceApiRateLimit(request, {
    scope: "bug-report",
    limit: 5,
    windowMs: 60 * 60 * 1000
  });
  if (rateLimited) return rateLimited;

  try {
    const input = bugReportRequestSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Bug reporting is not available in this environment." },
        { status: 503 }
      );
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user?.id || !user.email) {
      return NextResponse.json(
        { error: "Please log in before sending a bug report." },
        { status: 401 }
      );
    }

    const delivery = await sendBugReportEmail({
      ...input,
      userId: user.id,
      userEmail: user.email
    });

    if (!delivery.sent) {
      console.error(`[bug-report] delivery unavailable: ${delivery.reason}`);
      return NextResponse.json(
        { error: "We could not deliver your report. Please try again in a moment." },
        { status: delivery.reason === "not-configured" ? 503 : 502 }
      );
    }

    await captureServerEvent(user.id, "bug_report_submitted", {
      page_url: input.pageUrl,
      locale: input.locale,
      resend_id: delivery.id ?? null
    }).catch(() => undefined);

    return NextResponse.json({ submitted: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    if (error && typeof error === "object" && "issues" in error) {
      return NextResponse.json(
        { error: "Please complete the required fields and try again." },
        { status: 400 }
      );
    }
    console.error("[bug-report] request failed", error);
    return NextResponse.json(
      { error: "Failed to submit the bug report." },
      { status: 500 }
    );
  }
}
