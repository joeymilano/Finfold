import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { termsOfService } from "@/lib/legal";

export const metadata: Metadata = {
  title: `${termsOfService.title.en} — Finfold`,
  description: termsOfService.description.en,
  alternates: { canonical: "/terms" }
};

export default function TermsPage() {
  return <LegalPage doc={termsOfService} />;
}
