import type { Metadata } from "next";
import { ToolsIndexView } from "@/components/tools/ToolsIndexView";
import { brand } from "@/lib/brand";
import { buildToolsCollectionSchema } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: `Free AI Content Generators — ${brand.name}`,
  description: "Generate platform-native content for Xiaohongshu, Zhihu, WeChat, X, LinkedIn, Reddit, and Product Hunt, then expand one source across all 14 channels.",
  alternates: {
    canonical: "/en/tools",
    languages: { "zh-CN": "/tools", en: "/en/tools", "x-default": "/tools" }
  },
  openGraph: {
    title: `Free Platform Content Generators — ${brand.name}`,
    description: "Start with one channel and create an editable, platform-native draft for free.",
    url: "/en/tools",
    locale: "en_US",
    type: "website",
    images: [brand.socialImage]
  }
};

export default function EnglishToolsIndexPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildToolsCollectionSchema("en")) }} />
      <ToolsIndexView locale="en" />
    </>
  );
}
