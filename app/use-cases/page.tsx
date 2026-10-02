import type { Metadata } from "next";
import { UseCaseIndexView } from "@/components/use-cases/UseCaseIndexView";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: `三个被内容追着跑的时刻：Finfold 使用场景 — ${brand.name}`,
  description: "从凌晨发布、一个人改四个平台，到仓库开门前的新品首发。用四个有温度的复合故事，看 Finfold 如何审查真实信号、准备可审核任务，并接过跨平台内容工作中最磨人的重复步骤。",
  alternates: {
    canonical: "/use-cases",
    languages: { "zh-CN": "/use-cases", en: "/en/use-cases", "x-default": "/use-cases" }
  },
  openGraph: {
    title: `三个被内容追着跑的时刻 — ${brand.name}`,
    description: "不是抽象用户画像，而是凌晨发布、内容复用和跨境首发里真实会卡住人的那一刻。",
    url: "/use-cases",
    locale: "zh_CN",
    type: "website",
    images: ["/use-cases/founder-midnight-launch.webp"]
  }
};

export default function UseCasesPage() {
  return <UseCaseIndexView locale="zh" />;
}
