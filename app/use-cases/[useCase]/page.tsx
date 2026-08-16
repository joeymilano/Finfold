import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UseCasePage } from "@/components/use-cases/UseCasePage";
import { brand } from "@/lib/brand";
import { buildUseCaseSchema } from "@/lib/use-case-schema";
import { getUseCasePage, useCasePages } from "@/lib/use-case-pages";

export function generateStaticParams() {
  return useCasePages.map((page) => ({ useCase: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ useCase: string }> }): Promise<Metadata> {
  const { useCase: slug } = await params;
  const config = getUseCasePage(slug);
  if (!config) return { title: brand.name };
  const title = config.searchTitleZh ?? config.titleZh;
  const description = config.searchDescriptionZh ?? config.descriptionZh;

  return {
    title,
    description,
    alternates: {
      canonical: `/use-cases/${config.slug}`,
      languages: {
        "zh-CN": `/use-cases/${config.slug}`,
        en: `/en/use-cases/${config.slug}`,
        "x-default": `/use-cases/${config.slug}`
      }
    },
    openGraph: {
      title,
      description,
      url: `/use-cases/${config.slug}`,
      locale: "zh_CN",
      type: "website",
      images: [{ url: config.image, alt: config.imageAltZh }]
    }
  };
}

export default async function UseCaseRoutePage({ params }: { params: Promise<{ useCase: string }> }) {
  const { useCase: slug } = await params;
  const config = getUseCasePage(slug);
  if (!config) notFound();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildUseCaseSchema(config, "zh")) }} />
      <UseCasePage config={config} locale="zh" />
    </>
  );
}
