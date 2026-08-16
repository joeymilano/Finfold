import { z } from "zod";

export const missionOutcomeEventTypeSchema = z.enum([
  "view",
  "click",
  "lead",
  "signup",
  "trial",
  "purchase",
  "revenue"
]);

export type MissionOutcomeEventType = z.infer<typeof missionOutcomeEventTypeSchema>;

export type MissionOutcomeSummary = {
  views: number;
  clicks: number;
  leads: number;
  signups: number;
  trials: number;
  purchases: number;
  revenue: number;
  currency: string;
};

export type MissionTrackingLink = {
  id: string;
  code: string;
  destinationUrl: string;
  trackingUrl: string;
  source: string;
  medium: string;
  campaign: string;
  content: string | null;
  status: "active" | "disabled";
};

export type MissionAction = {
  id: string;
  kind: string;
  status: "queued" | "running" | "awaiting_approval" | "succeeded" | "failed" | "cancelled";
  riskLevel: "low" | "medium" | "high";
  requiresApproval: boolean;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type MissionTimelineEvent = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export const manualOutcomeSchema = z.object({
  eventType: z.enum(["lead", "signup", "trial", "purchase", "revenue"]),
  count: z.number().int().min(1).max(10_000).default(1),
  value: z.number().nonnegative().max(100_000_000).default(0),
  currency: z.string().regex(/^[A-Z]{3}$/).default("CNY"),
  note: z.string().trim().max(500).default(""),
  idempotencyKey: z.string().uuid()
}).superRefine((input, context) => {
  if (input.eventType === "revenue" && input.value <= 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Revenue must be greater than zero." });
  }
});

export function emptyMissionOutcomeSummary(currency = "CNY"): MissionOutcomeSummary {
  return { views: 0, clicks: 0, leads: 0, signups: 0, trials: 0, purchases: 0, revenue: 0, currency };
}

export function summarizeMissionOutcomeRows(rows: Array<{
  event_type?: unknown;
  quantity?: unknown;
  value?: unknown;
  currency?: unknown;
}>): MissionOutcomeSummary {
  const firstCurrency = rows.find((row) => row.event_type === "revenue" && typeof row.currency === "string")?.currency
    ?? rows.find((row) => typeof row.currency === "string")?.currency;
  const summary = emptyMissionOutcomeSummary(typeof firstCurrency === "string" ? firstCurrency : "CNY");
  for (const row of rows) {
    const type = row.event_type;
    const quantity = Math.max(1, Number(row.quantity ?? 1));
    if (type === "view") summary.views += quantity;
    if (type === "click") summary.clicks += quantity;
    if (type === "lead") summary.leads += quantity;
    if (type === "signup") summary.signups += quantity;
    if (type === "trial") summary.trials += quantity;
    if (type === "purchase") summary.purchases += quantity;
    if (type === "revenue") summary.revenue += Number(row.value ?? 0);
  }
  return summary;
}

export function appendTrackingParams(destination: string, link: {
  source: string;
  medium: string;
  campaign: string;
  content?: string | null;
}): string {
  const url = new URL(destination);
  url.searchParams.set("utm_source", link.source);
  url.searchParams.set("utm_medium", link.medium);
  url.searchParams.set("utm_campaign", link.campaign);
  if (link.content) url.searchParams.set("utm_content", link.content);
  return url.toString();
}

export function sanitizeTrackingDestination(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Tracking destination must use HTTP or HTTPS.");
  if (url.username || url.password) throw new Error("Tracking destination cannot include credentials.");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isPrivateTrackingHost(hostname)) throw new Error("Tracking destination must be a public website.");
  return url.toString();
}

function isPrivateTrackingHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return true;
  if (hostname === "::1" || hostname === "0:0:0:0:0:0:0:1") return true;
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;
  return first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

export function campaignSlug(title: string): string {
  const latin = title
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48);
  return latin || "growth-mission";
}

export function generateTrackingCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}
