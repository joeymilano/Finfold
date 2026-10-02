import type { Metadata } from "next";
import { headers } from "next/headers";
import { AccountHealthCenter } from "@/components/app-shell/AccountHealthCenter";
import { OperationsSectionNav } from "@/components/app-shell/OperationsSectionNav";
import { xPipelineVisibleForNav } from "@/lib/x-pipeline/settings";
import { growthLoopVisibleForNav } from "@/lib/growth-loop/contracts";
import { detectLocaleFromHeaders } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = detectLocaleFromHeaders(await headers());
  return locale === "en"
    ? {
        title: "Account Health & Throttle Diagnosis | Finfold",
        description: "Upload account, post, or platform notice data and let the Finfold Agent diagnose traffic anomalies, throttling risks, and high-risk phrasing in a professional action report."
      }
    : {
        title: "账号体检与限流诊断 | Finfold",
        description: "上传账号、Post、数据或平台通知，让 Finfold智能体诊断流量异常、限流风险与高风险表达，并生成专业行动报告。"
      };
}

export default function AccountHealthPage() {
  return <><OperationsSectionNav growthLoop={growthLoopVisibleForNav()} xPipeline={xPipelineVisibleForNav()} /><AccountHealthCenter /></>;
}
