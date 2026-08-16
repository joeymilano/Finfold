import type { Metadata } from "next";
import { ToolsIndexView } from "@/components/tools/ToolsIndexView";
import { brand } from "@/lib/brand";
import { buildToolsCollectionSchema } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: `免费 AI 内容生成器 — ${brand.name}`,
  description: "免费生成小红书、知乎、公众号、X、LinkedIn、Reddit 和 Product Hunt 平台原生内容，再把同一份素材扩展到全部 14 个平台。",
  alternates: {
    canonical: "/tools",
    languages: { "zh-CN": "/tools", en: "/en/tools", "x-default": "/tools" }
  },
  openGraph: {
    title: `免费平台内容生成器 — ${brand.name}`,
    description: "从一个具体平台开始，生成可以继续编辑和发布的原生内容。",
    url: "/tools",
    locale: "zh_CN",
    type: "website",
    images: [brand.socialImage]
  }
};

export default function ToolsIndexPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildToolsCollectionSchema("zh")) }} />
      <ToolsIndexView locale="zh" />
    </>
  );
}
