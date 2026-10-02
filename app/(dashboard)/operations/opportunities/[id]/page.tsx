import type { Metadata } from "next";
import { headers } from "next/headers";
import { OpportunityDetail } from "@/components/app-shell/OpportunityDetail";
import { OperationsSectionNav } from "@/components/app-shell/OperationsSectionNav";
import { xPipelineVisibleForNav } from "@/lib/x-pipeline/settings";
import { growthLoopVisibleForNav } from "@/lib/growth-loop/contracts";
import { detectLocaleFromHeaders } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = detectLocaleFromHeaders(await headers());
  return locale === "en"
    ? {
        title: "Opportunity Detail | Finfold",
        description: "Review trend evidence, account-match reasons, and recommended content angles."
      }
    : {
        title: "机会详情 | Finfold",
        description: "查看趋势证据、账号匹配原因和推荐内容角度。"
      };
}

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <><OperationsSectionNav growthLoop={growthLoopVisibleForNav()} xPipeline={xPipelineVisibleForNav()} /><OpportunityDetail opportunityId={id} /></>;
}
