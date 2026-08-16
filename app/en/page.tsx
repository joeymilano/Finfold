import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { AuthenticatedRedirect } from "@/components/landing/AuthenticatedRedirect";
import { brand } from "@/lib/brand";
import { buildFaqSchema, buildOrganizationSchema, buildSoftwareApplicationSchema } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "AI Marketing Agent for Small Teams | Finfold",
  description: "Finfold audits your website, prepares reviewable growth missions, creates platform-native content for 14 channels, and learns from real outcomes—with human approval before publishing.",
  alternates: {
    canonical: "/en",
    languages: { "zh-CN": "/", en: "/en", "x-default": "/" }
  },
  openGraph: {
    title: "AI Marketing Agent for Small Teams | Finfold",
    description: "Find a growth opportunity, prepare a reviewable mission, create channel-native content, and carry real outcomes into the next round.",
    url: "/en",
    locale: "en_US",
    siteName: brand.name,
    type: "website",
    images: [brand.socialImage]
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Marketing Agent for Small Teams | Finfold",
    description: "A reviewable AI marketing workflow for finding opportunities, preparing missions, and learning from real outcomes.",
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
      <LandingPage initialLocale="en" localeHref="/" />
    </>
  );
}
