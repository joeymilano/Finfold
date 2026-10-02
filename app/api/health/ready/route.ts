
import { NextResponse } from "next/server";
import { hasValidIntegrationEncryptionKey } from "@/lib/secret-encryption";
import { createSupabaseAdminClient } from "@/lib/supabase";

export async function GET() {
  const missing = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "INTEGRATION_ENCRYPTION_KEY"
  ].filter((key) => !process.env[key]);

  if (
    process.env.INTEGRATION_ENCRYPTION_KEY
    && !hasValidIntegrationEncryptionKey()
  ) {
    missing.push("INTEGRATION_ENCRYPTION_KEY_must_decode_to_32_bytes");
  }

  if (process.env.ALLOW_MOCK === "true") missing.push("ALLOW_MOCK_must_be_false");
  if (!(process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://")) missing.push("NEXT_PUBLIC_APP_URL_must_be_https");

  if (missing.length > 0) {
    console.error("[health/ready] missing or invalid production configuration:", missing.join(","));
    return response({ status: "degraded" }, 503);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return response({ status: "degraded" }, 503);

  const { error } = await admin.from("profiles").select("id", { head: true }).limit(1);
  if (error) {
    console.error("[health/ready] database probe failed:", JSON.stringify(error));
    return response({ status: "degraded" }, 503);
  }

  return response({
    status: "ready",
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown"
  }, 200);
}

function response(body: Record<string, string>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}
