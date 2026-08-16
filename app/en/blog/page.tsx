import type { Metadata } from "next";
import { BlogIndexView } from "@/components/blog/BlogIndexView";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Growth Field Notes — ${brand.name}`,
  description: "Real content failures, platform judgment, and small experiments for X, LinkedIn, Xiaohongshu, and Reddit.",
  alternates: {
    canonical: "/en/blog",
    languages: { "zh-CN": "/blog", en: "/en/blog", "x-default": "/blog" }
  },
  openGraph: {
    title: `Growth Field Notes — ${brand.name}`,
    description: "Field stories, wrong calls, and useful experiments from real platform work.",
    url: "/en/blog",
    locale: "en_US",
    type: "website",
    images: [brand.socialImage]
  }
};

export default function EnglishBlogIndexPage() {
  return <BlogIndexView locale="en" />;
}
