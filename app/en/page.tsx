import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { AuthenticatedRedirect } from "@/components/landing/AuthenticatedRedirect";
import { brand } from "@/lib/brand";
import { buildFaqSchema, buildOrganizationSchema, buildSoftwareApplicationSchema } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Your AI Marketing Employee — Growth, Run End to End | Finfold",
  description: "Finfold diagnoses Xiaohongshu, X, and Reddit accounts and posts, flags reach breaks and risky wording, and turns the evidence into reviewable growth missions.",
  alternates: {
    canonical: "/en",
    languages: { "zh-CN": "/", en: "/en", "x-default": "/" }
  },
  openGraph: {
    title: "Your AI Marketing Employee — Growth, Run End to End | Finfold",
    description: "Upload an account, posts, or analytics. Finfold diagnoses reach issues and risky wording, then delivers a professional action report.",
    url: "/en",
    locale: "en_US",
    siteName: brand.name,
    type: "website",
    images: [brand.socialImage]
  },
  twitter: {
    card: "summary_large_image",
    title: "Your AI Marketing Employee — Growth, Run End to End | Finfold",
    description: "Diagnose account health and risky post language before preparing the next marketing move.",
    images: [brand.socialImage.url]
  }
};

export default function EnglishHomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildOrganizationSchema()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildSoftwareApplicationSchema("en")) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqSchema("en")) }}
      />
      <AuthenticatedRedirect />
      <LandingPage initialLocale="en" localeHref="/#stay" />
    </>
  );
}
