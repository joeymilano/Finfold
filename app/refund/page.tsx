import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { refundPolicy } from "@/lib/legal";

export const metadata: Metadata = {
  title: `${refundPolicy.title.en} — Finfold`,
  description: refundPolicy.description.en,
  alternates: { canonical: "/refund" }
};

export default function RefundPage() {
  return <LegalPage doc={refundPolicy} />;
}
