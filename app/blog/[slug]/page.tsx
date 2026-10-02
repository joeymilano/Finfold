import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { blogPosts, getBlogPost } from "@/lib/blog-posts";
import { BlogPostView } from "@/components/blog/BlogPostView";
import { buildArticleSchema } from "@/lib/structured-data";
import { brand } from "@/lib/brand";
import { getBlogVisual } from "@/lib/blog-visuals";

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    return { title: brand.name };
  }

  const title = post.seoTitleZh ?? post.titleZh;
  const description = post.seoDescriptionZh ?? post.descriptionZh;
  const visual = getBlogVisual(post.slug);

  return {
    title,
    description,
    authors: [{ name: "Finfold Editorial", url: `${brand.siteUrl}/blog` }],
    alternates: {
      canonical: `/blog/${post.slug}`,
      languages: {
        "zh-CN": `/blog/${post.slug}`,
        en: `/en/blog/${post.slug}`,
        "x-default": `/blog/${post.slug}`
      }
    },
    openGraph: {
      title,
      description,
      url: `/blog/${post.slug}`,
      locale: "zh_CN",
      type: "article",
      publishedTime: `${post.publishedAt}T00:00:00.000Z`,
      modifiedTime: `${post.updatedAt}T00:00:00.000Z`,
      authors: ["Finfold Editorial"],
      images: [{ url: visual.src, width: 1792, height: 1008, alt: visual.altZh }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [visual.src]
    }
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildArticleSchema(post, "zh")) }}
      />
      <BlogPostView post={post} initialLocale="zh" localeHref={`/en/blog/${post.slug}`} />
    </>
  );
}
