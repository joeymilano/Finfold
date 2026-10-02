import type { Metadata } from "next";
import { headers } from "next/headers";
import { OperatingProgramSetup } from "@/components/app-shell/OperatingProgramSetup";
import { OperationsSectionNav } from "@/components/app-shell/OperationsSectionNav";
import { xPipelineVisibleForNav } from "@/lib/x-pipeline/settings";
import { growthLoopVisibleForNav } from "@/lib/growth-loop/contracts";
import { detectLocaleFromHeaders } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = detectLocaleFromHeaders(await headers());
  return locale === "en"
    ? {
        title: "Operations Projects | Finfold",
        description: "Set your flagship product, target customers, qualified-lead rules, and research watchlists."
      }
    : {
        title: "运营项目 | Finfold",
        description: "设置主推产品、目标客户、有效线索规则和调研关注列表。"
      };
}

export default function OperationsPage() {
  return <><OperationsSectionNav growthLoop={growthLoopVisibleForNav()} xPipeline={xPipelineVisibleForNav()} /><OperatingProgramSetup /></>;
}
