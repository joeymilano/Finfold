import { z } from "zod";
import type { ExtensionPlatform } from "@/lib/extension/contracts";
import { hmacHex } from "@/lib/extension/crypto";
import type { ModelAttemptAudit } from "@/lib/llm";
import { createSupabaseAdminClient } from "@/lib/supabase";

const reservationSchema = z.object({
  outcome: z.enum([
    "reserved",
    "existing_reserved",
    "existing_succeeded",
    "existing_failed",
    "installation_limit",
    "ip_limit",
    "global_limit"
  ]),
  actionId: z.string().uuid().optional()
});

export type AnonymousReservation = z.infer<typeof reservationSchema>;

export function anonymousFeatureEnabled(): boolean {
  return process.env.FINFOLD_EXTENSION_ANONYMOUS_ENABLED === "true";
}

export function extensionAuthEnabled(): boolean {
  return process.env.FINFOLD_EXTENSION_AUTH_ENABLED === "true";
}

export function extensionPaidActionsEnabled(): boolean {
  return process.env.FINFOLD_EXTENSION_PAID_ACTIONS_ENABLED === "true";
}

export async function reserveAnonymousAction(input: {
  requestId: string;
  installationId: string;
  ip: string;
  platform: ExtensionPlatform;
  now?: Date;
}): Promise<AnonymousReservation> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Extension anonymous ledger is not configured.");
  const now = input.now ?? new Date();
  const usageDay = now.toISOString().slice(0, 10);
  const previousUsageDay = new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
  const globalLimit = boundedEnvInteger("FINFOLD_EXTENSION_ANONYMOUS_DAILY_LIMIT", 100, 1, 100);
  const ipLimit = boundedEnvInteger("FINFOLD_EXTENSION_ANONYMOUS_IP_ATTEMPTS", 3, 1, 3);

  const { data, error } = await supabase.rpc("reserve_extension_anonymous_action", {
    p_request_id: input.requestId,
    p_installation_hash: await hmacHex("extension-installation-v1", input.installationId),
    p_ip_day_hash: await hmacHex("extension-ip-day-v1", `${usageDay}\u0000${input.ip}`),
    p_previous_ip_day_hash: await hmacHex("extension-ip-day-v1", `${previousUsageDay}\u0000${input.ip}`),
    p_usage_day: usageDay,
    p_platform: input.platform,
    p_ip_attempt_limit: ipLimit,
    p_global_attempt_limit: globalLimit
  });
  if (error) throw new Error("Could not reserve anonymous generation.");
  return reservationSchema.parse(data);
}

export async function completeAnonymousAction(input: {
  actionId: string;
  audit: ModelAttemptAudit | null;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Extension anonymous ledger is not configured.");
  const { data, error } = await supabase
    .from("extension_anonymous_actions")
    .update({
      status: "succeeded",
      provider_name: input.audit?.provider ?? null,
      input_tokens: input.audit?.inputTokens ?? null,
      output_tokens: input.audit?.outputTokens ?? null,
      total_tokens: input.audit?.totalTokens ?? null,
      completed_at: new Date().toISOString()
    })
    .eq("id", input.actionId)
    .eq("status", "reserved")
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error("Could not finalize anonymous generation.");
}

export async function failAnonymousAction(input: {
  actionId: string;
  failureCode: string;
  audit?: ModelAttemptAudit | null;
}): Promise<void> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  await supabase
    .from("extension_anonymous_actions")
    .update({
      status: "failed",
      failure_code: input.failureCode.slice(0, 80),
      provider_name: input.audit?.provider ?? null,
      input_tokens: input.audit?.inputTokens ?? null,
      output_tokens: input.audit?.outputTokens ?? null,
      total_tokens: input.audit?.totalTokens ?? null,
      completed_at: new Date().toISOString()
    })
    .eq("id", input.actionId)
    .eq("status", "reserved");
}

export function requestIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  ).slice(0, 128);
}

function boundedEnvInteger(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
