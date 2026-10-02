import { z } from "zod";
import { hashOutcomeWebhookValue } from "@/lib/outcome-webhook";
import { decryptSecret, encryptSecret } from "@/lib/secret-encryption";
import type { createSupabaseAdminClient } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const MAX_LEAD_BODY_BYTES = 16 * 1024;
export const NATIVE_LEAD_CONSENT_VERSION = "privacy-2026-08-26";

export const nativeLeadSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  workEmail: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  company: z.string().trim().min(2).max(120),
  need: z.string().trim().min(10).max(2_000),
  consent: z.literal(true),
  locale: z.enum(["en", "zh"]).default("en"),
  turnstileToken: z.string().trim().min(1).max(2_048)
});

export type NativeLeadSubmissionInput = z.infer<typeof nativeLeadSubmissionSchema>;

export type NativeLeadFormPublicDetail = {
  code: string;
  displayName: string;
  destinationHost: string;
  acceptingSubmissions: boolean;
};

export type NativeLeadSummary = {
  id: string;
  workEmail: string;
  company: string;
  need: string;
  locale: "en" | "zh";
  status: "new" | "qualified" | "rejected";
  consentedAt: string;
  reviewedAt: string | null;
  createdAt: string;
};

export async function readNativeLeadSubmission(request: Request): Promise<NativeLeadSubmissionInput> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new NativeLeadRequestError(415, "Content-Type must be application/json.", "unsupported_media_type");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_LEAD_BODY_BYTES) {
    throw new NativeLeadRequestError(413, "Lead submission is too large.", "request_too_large");
  }
  if (!request.body) {
    throw new NativeLeadRequestError(400, "Lead submission is required.", "invalid_json");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_LEAD_BODY_BYTES) {
      await reader.cancel();
      throw new NativeLeadRequestError(413, "Lead submission is too large.", "request_too_large");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new NativeLeadRequestError(400, "Lead submission must be valid JSON.", "invalid_json");
  }
  const parsed = nativeLeadSubmissionSchema.safeParse(payload);
  if (!parsed.success) {
    throw new NativeLeadRequestError(
      400,
      parsed.error.issues[0]?.message ?? "Lead submission is invalid.",
      "invalid_submission"
    );
  }
  return parsed.data;
}

export async function ingestNativeLeadCandidate(
  admin: AdminClient,
  input: {
    trackingCode: string;
    submission: NativeLeadSubmissionInput;
    occurredAt?: string;
  }
): Promise<{ accepted: boolean; replayed: boolean; leadSubmissionId: string }> {
  const canonicalPayload = JSON.stringify({
    workEmail: input.submission.workEmail,
    company: input.submission.company,
    need: input.submission.need,
    consent: true,
    locale: input.submission.locale,
    consentVersion: NATIVE_LEAD_CONSENT_VERSION
  });
  const [submissionHash, payloadHash, emailHash, encryptedWorkEmail, encryptedCompany, encryptedNeed] = await Promise.all([
    hashOutcomeWebhookValue(`native-lead-submission:${input.submission.submissionId}`),
    hashOutcomeWebhookValue(canonicalPayload),
    hashOutcomeWebhookValue(`native-lead-email:${input.submission.workEmail}`),
    encryptSecret(input.submission.workEmail),
    encryptSecret(input.submission.company),
    encryptSecret(input.submission.need)
  ]);

  const { data, error } = await admin.rpc("ingest_native_lead_candidate", {
    p_tracking_code: input.trackingCode,
    p_submission_hash: submissionHash,
    p_payload_hash: payloadHash,
    p_email_hash: emailHash,
    p_encrypted_work_email: encryptedWorkEmail,
    p_encrypted_company: encryptedCompany,
    p_encrypted_need: encryptedNeed,
    p_locale: input.submission.locale,
    p_consent_version: NATIVE_LEAD_CONSENT_VERSION,
    p_occurred_at: input.occurredAt ?? new Date().toISOString()
  });
  if (error) throw error;
  const row = asRecord(data);
  if (row.accepted !== true || typeof row.leadSubmissionId !== "string") {
    throw new Error("Lead ingestion returned an invalid database response.");
  }
  return {
    accepted: true,
    replayed: row.replayed === true,
    leadSubmissionId: row.leadSubmissionId
  };
}

export async function loadNativeLeadForm(
  admin: AdminClient,
  trackingCode: string
): Promise<NativeLeadFormPublicDetail | null> {
  const { data: link, error: linkError } = await admin
    .from("tracking_links")
    .select("id, code, user_id, mission_id, destination_url, status")
    .eq("code", trackingCode)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) return null;

  const { data: mission, error: missionError } = await admin
    .from("growth_missions")
    .select("id, user_id, mission_kind, status, execution_state")
    .eq("id", link.mission_id)
    .eq("user_id", link.user_id)
    .maybeSingle();
  if (missionError) throw missionError;
  if (!mission) return null;

  const destination = new URL(String(link.destination_url));
  const destinationHost = destination.hostname.toLowerCase();
  const displayName = brandLabelFromHost(destinationHost);
  return {
    code: String(link.code),
    displayName,
    destinationHost,
    acceptingSubmissions:
      link.status === "active"
      && mission.mission_kind === "growth_opportunity"
      && mission.status === "posted"
      && (mission.execution_state === "measuring" || mission.execution_state === "review_due")
  };
}

export async function listNativeLeadSubmissions(
  admin: AdminClient,
  input: { userId: string; missionId: string; limit?: number }
): Promise<NativeLeadSummary[]> {
  const limit = Math.max(1, Math.min(100, input.limit ?? 50));
  const { data, error } = await admin
    .from("native_lead_submissions")
    .select("id, encrypted_work_email, encrypted_company, encrypted_need, locale, status, consented_at, reviewed_at, created_at")
    .eq("mission_owner_user_id", input.userId)
    .eq("mission_id", input.missionId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return Promise.all((data ?? []).map(async (row) => {
    const [workEmail, company, need] = await Promise.all([
      decryptSecret(String(row.encrypted_work_email)),
      decryptSecret(String(row.encrypted_company)),
      decryptSecret(String(row.encrypted_need))
    ]);
    const status = row.status === "qualified" || row.status === "rejected" ? row.status : "new";
    return {
      id: String(row.id),
      workEmail,
      company,
      need,
      locale: row.locale === "zh" ? "zh" : "en",
      status,
      consentedAt: String(row.consented_at),
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      createdAt: String(row.created_at)
    };
  }));
}

export class NativeLeadRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "NativeLeadRequestError";
  }
}

function brandLabelFromHost(hostname: string): string {
  const stripped = hostname.replace(/^www\./, "");
  if (stripped === "finfold.app") return "Finfold";
  return stripped;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
