import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { brand } from "@/lib/brand";
import { findPublicLeadTool, getPublicLeadTool } from "@/lib/lead-tools/service";
import { LeadToolRuntime } from "@/components/lead-tools/LeadToolRuntime";

type PageParams = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  // Metadata resolves WITHOUT counting an open — the page render below is
  // the single counted view per visit.
  const tool = await findPublicLeadTool(slug);
  const title = tool
    ? `${tool.title} — ${tool.spec.brand.name}`
    : `${brand.name}`;

  return {
    title,
    description: tool?.spec.intro ?? brand.slogan,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description: tool?.spec.intro ?? brand.slogan,
      type: "website",
      images: [tool?.spec.brand.logo_url ? { url: tool.spec.brand.logo_url } : brand.socialImage]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: tool?.spec.intro ?? brand.slogan,
      images: [brand.socialImage.url]
    }
  };
}

export default async function LeadToolPage({ params }: PageParams) {
  const { slug } = await params;
  const tool = await getPublicLeadTool(slug);
  if (!tool) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-bg">
      <LeadToolRuntime spec={tool.spec} slug={tool.slug} mode="public" />
    </main>
  );
}
