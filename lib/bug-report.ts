import { z } from "zod";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_NOTIFY_TO = "joey@finfold.app";
const DEFAULT_FROM = "Finfold Feedback <joey@finfold.app>";

export const bugReportRequestSchema = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().min(10).max(4000),
  steps: z.string().trim().max(2000).optional().default(""),
  pageUrl: z.string().trim().url().max(1000),
  userAgent: z.string().trim().max(500).optional().default(""),
  locale: z.enum(["zh", "en"]).default("zh")
});

export type BugReportRequest = z.infer<typeof bugReportRequestSchema>;

type BugReportEmailParams = BugReportRequest & {
  userId: string;
  userEmail: string;
};

export type BugReportEmailResult = {
  sent: boolean;
  reason?: "not-configured" | "timeout" | "network-error" | `api-${number}`;
  id?: string;
};

/**
 * Deliver a bug report straight to the founder inbox through the existing
 * Resend account. Unlike best-effort lifecycle emails, this result is surfaced
 * to the user so the UI never claims a report was received when delivery failed.
 */
export async function sendBugReportEmail(
  params: BugReportEmailParams
): Promise<BugReportEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "not-configured" };

  const notifyTo =
    process.env.BUG_REPORT_NOTIFY_EMAIL ??
    process.env.REFUND_NOTIFY_EMAIL ??
    DEFAULT_NOTIFY_TO;
  const notifyFrom =
    process.env.BUG_REPORT_NOTIFY_FROM ??
    process.env.RESEND_FROM ??
    DEFAULT_FROM;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: notifyFrom,
        to: [notifyTo],
        reply_to: params.userEmail,
        subject: `[Finfold Bug] ${params.title.replace(/\s+/g, " ")}`,
        text: renderBugReportText(params),
        html: renderBugReportHtml(params)
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `[bug-report] Resend API ${response.status}: ${detail.slice(0, 300)}`
      );
      return { sent: false, reason: `api-${response.status}` };
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: data.id };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[bug-report] send timed out (>8s)");
      return { sent: false, reason: "timeout" };
    }
    console.error("[bug-report] send failed", error);
    return { sent: false, reason: "network-error" };
  } finally {
    clearTimeout(timeout);
  }
}

function renderBugReportText(params: BugReportEmailParams): string {
  return [
    "New Finfold bug report",
    "",
    `Summary: ${params.title}`,
    `Reporter: ${params.userEmail}`,
    `User ID: ${params.userId}`,
    `Page: ${params.pageUrl}`,
    `Language: ${params.locale}`,
    `Browser: ${params.userAgent || "(not provided)"}`,
    "",
    "What happened:",
    params.description,
    "",
    "Steps to reproduce:",
    params.steps || "(not provided)"
  ].join("\n");
}

function renderBugReportHtml(params: BugReportEmailParams): string {
  const rows: Array<[string, string]> = [
    ["Reporter", params.userEmail],
    ["User ID", params.userId],
    ["Page", params.pageUrl],
    ["Language", params.locale],
    ["Browser", params.userAgent || "(not provided)"]
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:7px 10px;border:1px solid #e5e7eb;color:#6b7280;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:7px 10px;border:1px solid #e5e7eb;word-break:break-word;">${escapeHtml(value)}</td></tr>`
    )
    .join("");

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;color:#111827;line-height:1.55;">
  <p style="margin:0 0 6px;color:#b45309;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Finfold bug report</p>
  <h2 style="margin:0 0 18px;font-size:22px;">${escapeHtml(params.title)}</h2>
  <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:20px;">${rowsHtml}</table>
  <h3 style="margin:0 0 6px;font-size:14px;">What happened</h3>
  <div style="white-space:pre-wrap;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">${escapeHtml(params.description)}</div>
  <h3 style="margin:18px 0 6px;font-size:14px;">Steps to reproduce</h3>
  <div style="white-space:pre-wrap;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">${escapeHtml(params.steps || "(not provided)")}</div>
  <p style="margin:18px 0 0;color:#6b7280;font-size:12px;">Reply to this email to contact the reporter directly.</p>
</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
