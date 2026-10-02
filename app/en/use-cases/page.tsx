import type { Metadata } from "next";
import { UseCaseIndexView } from "@/components/use-cases/UseCaseIndexView";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Three Moments When Content Follows People Home — ${brand.name}`,
  description: "Three human composite stories: the post-midnight launch, the one-person repurposing day, and the cross-border launch before the warehouse opens.",
  alternates: {
    canonical: "/en/use-cases",
    languages: { "zh-CN": "/use-cases", en: "/en/use-cases", "x-default": "/use-cases" }
  },
  openGraph: {
    title: `Three Moments When Content Follows People Home — ${brand.name}`,
    description: "Not abstract personas: three concrete moments when content work gets in the way of the real work.",
    url: "/en/use-cases",
    locale: "en_US",
    type: "website",
    images: ["/use-cases/founder-midnight-launch.webp"]
  }
};

export default function EnglishUseCasesPage() {
  return <UseCaseIndexView locale="en" />;
}
