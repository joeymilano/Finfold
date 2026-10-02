import type { Metadata } from "next";
import { ToolsIndexView } from "@/components/tools/ToolsIndexView";
import { brand } from "@/lib/brand";
import { buildToolsCollectionSchema } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: `Free AI Content Generators for Six Platforms | ${brand.name}`,
  description: "Create editable drafts for Xiaohongshu, WeChat, Product Hunt, X, LinkedIn, and Reddit. Choose a platform, paste your source, and continue when ready.",
  alternates: {
    canonical: "/en/tools",
    languages: { "zh-CN": "/tools", en: "/en/tools", "x-default": "/tools" }
  },
  openGraph: {
    title: `Free AI Content Generators | ${brand.name}`,
    description: "Choose a platform, paste your source, and generate an editable draft.",
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
