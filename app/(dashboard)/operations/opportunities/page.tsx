import type { Metadata } from "next";
import { headers } from "next/headers";
import { LocalDeviceRadarPanel } from "@/components/app-shell/LocalDeviceRadarPanel";
import { OpportunityRadar } from "@/components/app-shell/OpportunityRadar";
import { OperationsSectionNav } from "@/components/app-shell/OperationsSectionNav";
import { xPipelineVisibleForNav } from "@/lib/x-pipeline/settings";
import { growthLoopVisibleForNav } from "@/lib/growth-loop/contracts";
import { detectLocaleFromHeaders } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = detectLocaleFromHeaders(await headers());
  return locale === "en"
    ? {
        title: "Opportunity Radar | Finfold",
        description: "Match the latest real trend signals to your brand, audience, and accounts, then hand confirmed angles to the Agent."
      }
    : {
        title: "机会雷达 | Finfold",
        description: "把最近的真实趋势信号匹配到品牌、受众和账号，确认后交给 Agent 生成草稿。"
      };
}

export default function OpportunityRadarPage() {
  return (
    <>
      <OperationsSectionNav growthLoop={growthLoopVisibleForNav()} xPipeline={xPipelineVisibleForNav()} />
      <OpportunityRadar />
      <div className="mt-8">
        <LocalDeviceRadarPanel />
      </div>
    </>
  );
}
