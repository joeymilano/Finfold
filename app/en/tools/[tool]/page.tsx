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
    title: config.searchTitleEn,
    description: config.searchDescriptionEn,
    alternates: {
      canonical: `/en/tools/${config.slug}`,
      languages: {
        "zh-CN": `/tools/${config.slug}`,
        en: `/en/tools/${config.slug}`,
        "x-default": `/tools/${config.slug}`
      }
    },
    openGraph: {
      title: config.searchTitleEn,
      description: config.searchDescriptionEn,
      url: `/en/tools/${config.slug}`,
      locale: "en_US",
      type: "website",
      images: [brand.socialImage]
    },
    twitter: {
      card: "summary_large_image",
      title: config.searchTitleEn,
      description: config.searchDescriptionEn,
      images: [brand.socialImage.url]
    }
  };
}

export default async function EnglishToolRoutePage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool: slug } = await params;
  const config = getToolPage(slug);

  if (!config) {
    notFound();
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildToolSchema(config, "en")) }}
      />
      <ToolPage config={config} initialLocale="en" localeHref={`/tools/${config.slug}`} />
    </>
  );
}
