import type { Metadata } from "next";
import { GuidePageView } from "@/components/landing/GuidePageView";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: `六件最值钱的本事：Finfold 使用手册 — ${brand.name}`,
  description:
    "Finfold 最强的六件事，一章一件讲清楚：一次输入多平台就绪、账号诊断、品牌资料、发布把关、记录复盘、智能体接入。每章一张示意图、三个步骤，哪件最头疼就先翻哪章。",
  alternates: {
    canonical: "/guide",
    languages: { "zh-CN": "/guide", en: "/en/guide", "x-default": "/guide" }
  },
  openGraph: {
    title: `Finfold 使用手册 — 六件最值钱的本事`,
    description: "一章一件本事，一张示意图、三个步骤。哪件最头疼，就先翻哪章。",
    url: "/guide",
    locale: "zh_CN",
    type: "website"
  }
};

export default function GuidePage() {
  return <GuidePageView locale="zh" />;
}
