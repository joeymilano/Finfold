import type { Metadata } from "next";
import { headers } from "next/headers";
import { OperationsSectionNav } from "@/components/app-shell/OperationsSectionNav";
import { xPipelineVisibleForNav } from "@/lib/x-pipeline/settings";
import { growthLoopVisibleForNav } from "@/lib/growth-loop/contracts";
import { LeadToolsCenter } from "@/components/lead-tools/LeadToolsCenter";
import { detectLocaleFromHeaders } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = detectLocaleFromHeaders(await headers());
  return locale === "en"
    ? {
        title: "Lead Tools | Finfold",
        description: "Turn your product intro into a customer-facing self-assessment with your own brand and consultation entry."
      }
    : {
        title: "获客搭子 | Finfold",
        description: "把产品介绍变成客户愿意用、愿意转发的互动自测，配好推广入口与效果复盘。"
      };
}

export default function LeadToolsPage() {
  return (
    <>
      <OperationsSectionNav growthLoop={growthLoopVisibleForNav()} xPipeline={xPipelineVisibleForNav()} />
      <LeadToolsCenter />
    </>
  );
}
