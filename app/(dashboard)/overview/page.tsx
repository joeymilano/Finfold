import type { Metadata } from "next";
import { headers } from "next/headers";
import { GrowthPortfolio } from "@/components/app-shell/GrowthPortfolio";
import { detectLocaleFromHeaders } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = detectLocaleFromHeaders(await headers());
  return locale === "en"
    ? {
        title: "Growth Overview | Finfold",
        description: "Real growth from every platform, summarized into one at-a-glance social media asset page."
      }
    : {
        title: "增长总览 | Finfold",
        description: "把各平台真实增长汇总成一眼看懂的社交媒体增长资产页。"
      };
}

export default function OverviewPage() {
  return <GrowthPortfolio />;
}
