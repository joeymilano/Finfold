import type { Metadata } from "next";
import { ToolsIndexView } from "@/components/tools/ToolsIndexView";
import { brand } from "@/lib/brand";
import { buildToolsCollectionSchema } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: `免费 AI 文案生成器｜小红书、公众号、LinkedIn、Reddit｜${brand.name}`,
  description: "免费生成小红书、公众号、Product Hunt、X、LinkedIn 和 Reddit 文案。选择平台，贴上现有材料，先在浏览器里检查，再进入创作台生成和修改。",
  alternates: {
    canonical: "/tools",
    languages: { "zh-CN": "/tools", en: "/en/tools", "x-default": "/tools" }
  },
  openGraph: {
    title: `免费 AI 文案生成器｜${brand.name}`,
    description: "选择平台，贴上材料，生成一篇可以继续修改的初稿。",
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
