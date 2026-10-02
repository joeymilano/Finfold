import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComparePage } from "@/components/compare/ComparePage";
import { brand } from "@/lib/brand";
import { buildCompareSchema } from "@/lib/compare-schema";
import { comparePages, getComparePage } from "@/lib/compare-pages";

export function generateStaticParams() {
  return comparePages.map((page) => ({ competitor: page.slug }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ competitor: string }>;
}): Promise<Metadata> {
  const { competitor: slug } = await params;
  const config = getComparePage(slug);
  if (!config) return { title: brand.name };

  return {
    title: config.title,
    description: config.description,
    alternates: {
      canonical: `/en/compare/${config.slug}`
    },
    openGraph: {
      title: config.title,
      description: config.description,
      url: `/en/compare/${config.slug}`,
      locale: "en_US",
      type: "website",
      images: [{ url: brand.socialImage.url, alt: brand.socialImage.alt }]
    }
  };
}

export default async function EnglishCompareRoutePage({
  params
}: {
  params: Promise<{ competitor: string }>;
}) {
  const { competitor: slug } = await params;
  const config = getComparePage(slug);
  if (!config) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildCompareSchema(config)) }}
      />
      <ComparePage config={config} />
    </>
  );
}
