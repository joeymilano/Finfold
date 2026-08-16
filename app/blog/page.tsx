import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { BlogIndexView } from "@/components/blog/BlogIndexView";

export const metadata: Metadata = {
  title: `增长博客：从难看的草稿开始 — ${brand.name}`,
  description: "不贩卖算法内幕。记录 X、LinkedIn、小红书和 Reddit 上真实的内容失败、判断与可以立刻执行的小实验。",
  alternates: {
    canonical: "/blog",
    languages: { "zh-CN": "/blog", en: "/en/blog", "x-default": "/blog" }
  },
  openGraph: {
    title: `增长博客：从难看的草稿开始 — ${brand.name}`,
    description: "真实的内容失败、平台判断，以及咖啡凉掉之前就能执行的小实验。",
    url: "/blog",
    locale: "zh_CN",
    type: "website",
    images: [brand.socialImage]
  }
};

export default function BlogIndexPage() {
  return <BlogIndexView locale="zh" />;
}
