import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { BlogIndexView } from "@/components/blog/BlogIndexView";

export const metadata: Metadata = {
  title: `真人增长案例｜原始来源、实际动作与结果边界｜${brand.name}`,
  description: "沿着原帖、实名访谈和公开记录复盘真实增长案例。每篇保留图片来源、数据口径、失败过程和可以实际执行的小实验，也明确标出当事人自报、已删除原文与目前无法确认的部分。",
  alternates: {
    canonical: "/blog",
    languages: { "zh-CN": "/blog", en: "/en/blog", "x-default": "/blog" }
  },
  openGraph: {
    title: `把人、代价和证据写回增长故事｜${brand.name}`,
    description: "真人案例、原始页面配图、可核对来源和不过度承诺的结果。",
    url: "/blog",
    locale: "zh_CN",
    type: "website",
    images: ["/editorial/real-cases/josh-ho-buffer.webp"]
  }
};

export default function BlogIndexPage() {
  return <BlogIndexView locale="zh" />;
}
