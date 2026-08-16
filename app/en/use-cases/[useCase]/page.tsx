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
  const title = config.searchTitleEn ?? config.titleEn;
  const description = config.searchDescriptionEn ?? config.descriptionEn;

  return {
    title,
    description,
    alternates: {
      canonical: `/en/use-cases/${config.slug}`,
      languages: {
        "zh-CN": `/use-cases/${config.slug}`,
        en: `/en/use-cases/${config.slug}`,
        "x-default": `/use-cases/${config.slug}`
      }
    },
    openGraph: {
      title,
      description,
      url: `/en/use-cases/${config.slug}`,
      locale: "en_US",
      type: "website",
      images: [{ url: config.image, alt: config.imageAltEn }]
    }
  };
}

export default async function EnglishUseCaseRoutePage({ params }: { params: Promise<{ useCase: string }> }) {
  const { useCase: slug } = await params;
  const config = getUseCasePage(slug);
  if (!config) notFound();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildUseCaseSchema(config, "en")) }} />
      <UseCasePage config={config} locale="en" />
    </>
  );
}
