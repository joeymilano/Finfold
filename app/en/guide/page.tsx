import type { Metadata } from "next";
import { GuidePageView } from "@/components/landing/GuidePageView";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: `The Finfold Field Guide — six ways it pays for itself`,
  description:
    "Six chapters, one capability each: platform-native content from one input, account diagnosis, brand voice, human review, the publishing log, and agent access. A diagram and three steps per chapter — start with whatever hurts most.",
  alternates: {
    canonical: "/en/guide",
    languages: { "zh-CN": "/guide", en: "/en/guide", "x-default": "/guide" }
  },
  openGraph: {
    title: `The Finfold Field Guide — ${brand.name}`,
    description: "Six chapters, one capability each. One diagram, three steps — start with whatever hurts most.",
    url: "/en/guide",
    locale: "en_US",
    type: "website"
  }
};

export default function EnGuidePage() {
  return <GuidePageView locale="en" />;
}
