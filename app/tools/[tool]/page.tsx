import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getToolPage, toolPages } from "@/lib/tool-pages";
import { ToolPage } from "@/components/tools/ToolPage";
import { buildToolSchema } from "@/lib/structured-data";
import { brand } from "@/lib/brand";

export function generateStaticParams() {
  return toolPages.map((tool) => ({ tool: tool.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const { tool: slug } = await params;
  const config = getToolPage(slug);

  if (!config) {
    return { title: "Finfold" };
  }

  return {
    title: config.searchTitleZh,
    description: config.searchDescriptionZh,
    alternates: {
      canonical: `/tools/${config.slug}`,
      languages: {
        "zh-CN": `/tools/${config.slug}`,
        en: `/en/tools/${config.slug}`,
        "x-default": `/tools/${config.slug}`
      }
    },
    openGraph: {
      title: config.searchTitleZh,
      description: config.searchDescriptionZh,
      url: `/tools/${config.slug}`,
      locale: "zh_CN",
      type: "website",
      images: [brand.socialImage]
    },
    twitter: {
      card: "summary_large_image",
      title: config.searchTitleZh,
      description: config.searchDescriptionZh,
      images: [brand.socialImage.url]
    }
  };
}

export default async function ToolRoutePage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool: slug } = await params;
  const config = getToolPage(slug);

  if (!config) {
    notFound();
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildToolSchema(config, "zh")) }}
      />
      <ToolPage config={config} initialLocale="zh" localeHref={`/en/tools/${config.slug}`} />
    </>
  );
}
