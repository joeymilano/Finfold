import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { privacyPolicy } from "@/lib/legal";

export const metadata: Metadata = {
  title: `${privacyPolicy.title.en} — Finfold`,
  description: privacyPolicy.description.en,
  alternates: { canonical: "/privacy" }
};

export default function PrivacyPage() {
  return <LegalPage doc={privacyPolicy} />;
}
