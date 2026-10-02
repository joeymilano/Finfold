import React from "react";
import { FieldGuide } from "@/components/landing/FieldGuide";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { MarketingLandingTracker } from "@/components/marketing/MarketingLandingTracker";
import { PublicSiteHeader } from "@/components/marketing/PublicSiteHeader";

export function GuidePageView({ locale }: { locale: "zh" | "en" }) {
  const isEn = locale === "en";

  return (
    <>
      <main className="min-h-screen bg-bg">
        <MarketingLandingTracker contentType="other" locale={locale} />
        <PublicSiteHeader locale={locale} localeHref={isEn ? "/guide" : "/en/guide"} />
        <FieldGuide locale={locale} headingLevel="h1" />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
