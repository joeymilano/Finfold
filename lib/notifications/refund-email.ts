/**
 * Best-effort email notification to the team when a user requests a refund.
 *
 * Zero-dependency: calls Resend's REST API directly with fetch (edge-safe,
 * no SDK to bundle). Skips silently when RESEND_API_KEY / REFUND_NOTIFY_EMAIL
 * aren't configured, so the refund flow NEVER depends on email being set up —
 * the PostHog event in /api/refund still fires regardless.
 *
 * Required env (set as Cloudflare Worker secrets):
 *   RESEND_API_KEY       — Resend API key (re_xxx)
 *   REFUND_NOTIFY_EMAIL  — address to notify (the team / Joey)
 *   REFUND_NOTIFY_FROM   — optional From header, defaults to refunds@finfold.app
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface RefundNotifyParams {
  userId: string;
  userEmail: string;
  plan: string;
  subscriptionId: string;
  orderId: string | null;
  amount: number | null;
  currency: string | null;
  reason: string | null;
}

export async function notifyRefundRequested(
  params: RefundNotifyParams
): Promise<{ sent: boolean; reason?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const notifyTo = process.env.REFUND_NOTIFY_EMAIL;
  const notifyFrom =
    process.env.REFUND_NOTIFY_FROM ?? "Finfold Refunds <refunds@finfold.app>";

  if (!apiKey || !notifyTo) {
    // Not configured — skip silently. The refund itself already succeeded.
    return { sent: false, reason: "not-configured" };
  }

  const amountDisplay =
    typeof params.amount === "number" && params.currency
      ? `${params.amount} ${params.currency}`
      : "(金额未知 / unknown)";

  const subject = `💸 退款申请 / Refund Request · ${params.userEmail} · ${params.plan}`;

  const resp = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: notifyFrom,
      to: notifyTo,
      reply_to: params.userEmail,
      subject,
      html: renderRefundEmail({ ...params, amountDisplay })
    })
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    console.error(
      `[refund-notify] Resend API ${resp.status}: ${detail.slice(0, 300)}`
    );
    return { sent: false, reason: `api-${resp.status}` };
  }

  const data = (await resp.json().catch(() => ({}))) as { id?: string };
  return { sent: true, id: data.id };
}

function renderRefundEmail(
  p: RefundNotifyParams & { amountDisplay: string }
): string {
  const rows: Array<[string, string]> = [
    ["用户邮箱 / Email", p.userEmail],
    ["用户 ID / User ID", p.userId],
    ["套餐 / Plan", p.plan],
    ["金额 / Amount", p.amountDisplay],
    ["订阅 ID / Subscription ID", p.subscriptionId],
    ["订单 ID / Order ID", p.orderId ?? "(无 / none)"],
    ["申请理由 / Reason", p.reason ?? "(用户未填写 / not provided)"]
  ];

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;color:#6b7280;border:1px solid #eee;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:6px 12px;font-weight:600;border:1px solid #eee;word-break:break-all;">${escapeHtml(v)}</td></tr>`
    )
    .join("");

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111827;">
  <h2 style="margin:0 0 4px;">💸 新退款申请 / New Refund Request</h2>
  <p style="margin:0 0 6px;color:#6b7280;">用户刚在 billing 页一键申请了 3 天无理由退款。请前往 <strong>Creem 后台</strong>处理款项退还（这是唯一的人工步骤）。</p>
  <p style="margin:0 0 16px;color:#6b7280;">A user just requested a 3-day no-questions-asked refund from the billing page. Please process the payout in the <strong>Creem dashboard</strong> — this is the only manual step.</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px;">${rowsHtml}</table>
  <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;">本邮件由系统自动发送 · 直接回复会直达用户邮箱（reply_to 已设置）<br/>Auto-sent by the system · Reply directly reaches the user's inbox (reply_to set)</p>
</div>`;
}

/**
 * Best-effort bilingual confirmation email sent to the USER who requested the
 * refund. Reassures them the request is received and sets timing expectations.
 * Same zero-dependency, edge-safe pattern as notifyRefundRequested.
 */
export async function notifyUserRefundConfirmed(params: {
  userEmail: string;
  plan: string;
  subscriptionId: string;
  amount: number | null;
  currency: string | null;
}): Promise<{ sent: boolean; reason?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const notifyFrom =
    process.env.REFUND_NOTIFY_FROM ?? "Finfold Refunds <refunds@finfold.app>";

  if (!apiKey) {
    return { sent: false, reason: "not-configured" };
  }

  const amountDisplay =
    typeof params.amount === "number" && params.currency
      ? `${params.amount} ${params.currency}`
      : "(金额未知 / unknown)";

  const subject = "✅ 退款申请已受理 / Refund Request Received · Finfold";

  const resp = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: notifyFrom,
      to: params.userEmail,
      reply_to: notifyFrom,
      subject,
      html: renderUserConfirmation({ ...params, amountDisplay })
    })
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    console.error(
      `[refund-user-notify] Resend API ${resp.status}: ${detail.slice(0, 300)}`
    );
    return { sent: false, reason: `api-${resp.status}` };
  }

  const data = (await resp.json().catch(() => ({}))) as { id?: string };
  return { sent: true, id: data.id };
}

function renderUserConfirmation(p: {
  plan: string;
  subscriptionId: string;
  amountDisplay: string;
}): string {
  const rows: Array<[string, string]> = [
    ["套餐 / Plan", p.plan],
    ["金额 / Amount", p.amountDisplay],
    ["订阅 ID / Subscription ID", p.subscriptionId],
    ["预计到账 / Estimated arrival", "5–10 个工作日 / 5–10 business days"]
  ];

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;color:#6b7280;border:1px solid #eee;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:6px 12px;font-weight:600;border:1px solid #eee;word-break:break-all;">${escapeHtml(v)}</td></tr>`
    )
    .join("");

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111827;">
  <h2 style="margin:0 0 4px;">✅ 您的退款申请已受理</h2>
  <p style="margin:0 0 16px;color:#6b7280;font-size:18px;">Your refund request has been received</p>
  <p style="margin:16px 0;">您好，我们已收到您的 3 天无理由退款申请。退款将<strong>原路退回您的支付账户</strong>，通常在 5–10 个工作日内到账。您的订阅已取消，账户已降级为免费版，您仍可继续使用基础功能。</p>
  <p style="margin:0 0 16px;">Hi there — we've received your 3-day no-questions-asked refund request. The refund will be <strong>returned to your original payment method</strong>, typically within 5–10 business days. Your subscription has been cancelled and your account downgraded to the Free plan, so you can keep using the core features.</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px;">${rowsHtml}</table>
  <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;">如有疑问，直接回复本邮件即可联系我们 · For any questions, just reply to this email.<br/>—— Finfold 团队 / The Finfold Team</p>
</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
