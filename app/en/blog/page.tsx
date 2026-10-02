import type { Metadata } from "next";
import { BlogIndexView } from "@/components/blog/BlogIndexView";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Real Growth Cases with Traceable Sources | ${brand.name}`,
  description: "Real people, original posts and interviews, source imagery, reported results, and the limits that keep each case honest.",
  alternates: {
    canonical: "/en/blog",
    languages: { "zh-CN": "/blog", en: "/en/blog", "x-default": "/blog" }
  },
  openGraph: {
    title: `Put the People, Cost, and Evidence Back into Growth Stories | ${brand.name}`,
    description: "Named cases, original source imagery, traceable evidence, and results without inflated promises.",
    url: "/en/blog",
    locale: "en_US",
    type: "website",
    images: ["/editorial/real-cases/josh-ho-buffer.webp"]
  }
};

export default function EnglishBlogIndexPage() {
  return <BlogIndexView locale="en" />;
}
