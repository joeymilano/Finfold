import { NextResponse } from "next/server";
import {
  canUseAutomaticOutcomeBackflow,
  resolveBusinessMissionPlan
} from "@/lib/business-mission-entitlements";
import {
  createOutcomeWebhookSecret,
  outcomeWebhookSecretPrefix,
  toOutcomeWebhookDeliverySummary,
  toOutcomeWebhookEndpointSummary
} from "@/lib/outcome-webhook";
import { captureServerEvent } from "@/lib/posthog-server";
import { encryptSecret } from "@/lib/secret-encryption";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";

const ENDPOINT_FIELDS = "id, status, secret_prefix, secret_version, last_received_at, rotated_at, created_at, updated_at";

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Business result connections require durable storage." }, { status: 503 });
    }

    const [plan, endpointResult] = await Promise.all([
      resolveBusinessMissionPlan(admin, userId),
      admin
        .from("outcome_webhook_endpoints")
        .select(ENDPOINT_FIELDS)
        .eq("user_id", userId)
        .maybeSingle()
    ]);
    if (endpointResult.error) throw endpointResult.error;

    const endpoint = endpointResult.data
      ? toOutcomeWebhookEndpointSummary(endpointResult.data as Record<string, unknown>)
      : null;
    let deliveries: ReturnType<typeof toOutcomeWebhookDeliverySummary>[] = [];
    if (endpoint) {
      const { data, error } = await admin
        .from("outcome_webhook_deliveries")
        .select("id, status, event_type, source, mission_id, attempt_count, error_code, received_at, processed_at")
        .eq("endpoint_id", endpoint.id)
        .eq("user_id", userId)
        .order("received_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      deliveries = (data ?? []).map((row) => toOutcomeWebhookDeliverySummary(row as Record<string, unknown>));
    }

    return noStoreJson({
      eligible: canUseAutomaticOutcomeBackflow(plan),
      plan,
      requiredPlan: "growth_v2",
      endpoint: endpoint ? { ...endpoint, url: endpointUrl(request, endpoint.id) } : null,
      deliveries
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to manage business result connections." }, { status: 401 });
    }
    logSettingsFailure("load", error);
    return NextResponse.json({ error: "Could not load the business result connection." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Business result connections require durable storage." }, { status: 503 });
    }

    const plan = await resolveBusinessMissionPlan(admin, userId);
    if (!canUseAutomaticOutcomeBackflow(plan)) {
      return NextResponse.json(
        {
          error: "Automatic business result backflow is available on Growth Engine and Digital Employee plans.",
          code: "upgrade_required",
          requiredPlan: "growth_v2"
        },
        { status: 403 }
      );
    }

    const { data: existing, error: existingError } = await admin
      .from("outcome_webhook_endpoints")
      .select(ENDPOINT_FIELDS)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingError) throw existingError;

    const now = new Date().toISOString();
    const secret = createOutcomeWebhookSecret();
    const encryptedSecret = await encryptSecret(secret);
    const secretPrefix = outcomeWebhookSecretPrefix(secret);
    let mutation;
    if (existing) {
      mutation = await admin
        .from("outcome_webhook_endpoints")
        .update({
          status: "active",
          encrypted_secret: encryptedSecret,
          secret_prefix: secretPrefix,
          secret_version: Math.max(1, Number(existing.secret_version ?? 1) + 1),
          rotated_at: now,
          updated_at: now
        })
        .eq("id", existing.id)
        .eq("user_id", userId)
        .select(ENDPOINT_FIELDS)
        .single();
    } else {
      mutation = await admin
        .from("outcome_webhook_endpoints")
        .insert({
          user_id: userId,
          status: "active",
          encrypted_secret: encryptedSecret,
          secret_prefix: secretPrefix,
          secret_version: 1,
          updated_at: now
        })
        .select(ENDPOINT_FIELDS)
        .single();
    }
    if (mutation.error) throw mutation.error;

    const endpoint = toOutcomeWebhookEndpointSummary(mutation.data as Record<string, unknown>);
    await captureServerEvent(userId, existing ? "outcome_webhook_secret_rotated" : "outcome_webhook_created", {
      endpoint_id: endpoint.id,
      plan
    });
    return noStoreJson({
      endpoint: { ...endpoint, url: endpointUrl(request, endpoint.id) },
      secret,
      rotated: Boolean(existing)
    }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to connect business results." }, { status: 401 });
    }
    logSettingsFailure("create", error);
    return NextResponse.json({ error: "Could not create the business result connection." }, { status: 503 });
  }
}

export async function DELETE() {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Business result connections require durable storage." }, { status: 503 });
    }

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("outcome_webhook_endpoints")
      .update({
        status: "disabled",
        encrypted_secret: null,
        secret_prefix: null,
        updated_at: now
      })
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Business result connection not found." }, { status: 404 });

    await captureServerEvent(userId, "outcome_webhook_disabled", { endpoint_id: String(data.id) });
    return noStoreJson({ disabled: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Please log in to disconnect business results." }, { status: 401 });
    }
    logSettingsFailure("disable", error);
    return NextResponse.json({ error: "Could not disable the business result connection." }, { status: 503 });
  }
}

function endpointUrl(request: Request, endpointId: string): string {
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
  return `${origin}/api/v1/outcomes/${encodeURIComponent(endpointId)}`;
}

function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function logSettingsFailure(operation: "load" | "create" | "disable", error: unknown): void {
  console.error("[outcome-webhook-settings] operation failed", {
    operation,
    errorType: error instanceof Error ? error.name : typeof error
  });
}
