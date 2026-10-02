import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicLeadForm } from "@/components/leads/PublicLeadForm";
import { loadNativeLeadForm } from "@/lib/native-leads";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Start a conversation | Finfold",
  description: "Share a real business need with the team behind this page.",
  robots: { index: false, follow: false }
};

export default async function LeadCapturePage({
  params
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!/^[A-Za-z0-9]{8,40}$/.test(code)) notFound();
  const admin = createSupabaseAdminClient();
  if (!admin) notFound();
  const detail = await loadNativeLeadForm(admin, code);
  if (!detail) notFound();

  const requestHeaders = await headers();
  const locale = /^zh\b/i.test(requestHeaders.get("accept-language") ?? "") ? "zh" : "en";

  return (
    <PublicLeadForm
      code={detail.code}
      displayName={detail.displayName}
      destinationHost={detail.destinationHost}
      acceptingSubmissions={detail.acceptingSubmissions}
      locale={locale}
      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
    />
  );
}
