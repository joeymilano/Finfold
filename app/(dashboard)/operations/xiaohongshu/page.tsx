import type { Metadata } from "next";
import { headers } from "next/headers";
import { OperationsSectionNav } from "@/components/app-shell/OperationsSectionNav";
import { xPipelineVisibleForNav } from "@/lib/x-pipeline/settings";
import { growthLoopVisibleForNav } from "@/lib/growth-loop/contracts";
import { XhsCoachingCenter } from "@/components/app-shell/XhsCoachingCenter";
import { detectLocaleFromHeaders } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = detectLocaleFromHeaders(await headers());
  return locale === "en"
    ? {
        title: "Xiaohongshu Coaching | Finfold",
        description: "Diagnose your account and every note with real Creator Center data, then run a 14-day single-variable experiment."
      }
    : {
        title: "小红书陪跑 | Finfold",
        description: "用真实创作中心数据完成账号与逐篇笔记诊断，并执行 14 天单变量实验。"
      };
}

export default function XiaohongshuCoachingPage() {
  return <><OperationsSectionNav growthLoop={growthLoopVisibleForNav()} xPipeline={xPipelineVisibleForNav()} /><XhsCoachingCenter /></>;
}
