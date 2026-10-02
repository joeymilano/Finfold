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

  const title = post.seoTitleEn ?? post.titleEn;
  const description = post.seoDescriptionEn ?? post.descriptionEn;
  const visual = getBlogVisual(post.slug);

  return {
    title,
    description,
    authors: [{ name: "Finfold Editorial", url: `${brand.siteUrl}/en/blog` }],
    alternates: {
      canonical: `/en/blog/${post.slug}`,
      languages: {
        "zh-CN": `/blog/${post.slug}`,
        en: `/en/blog/${post.slug}`,
        "x-default": `/blog/${post.slug}`
      }
    },
    openGraph: {
      title,
      description,
      url: `/en/blog/${post.slug}`,
      locale: "en_US",
      type: "article",
      publishedTime: `${post.publishedAt}T00:00:00.000Z`,
      modifiedTime: `${post.updatedAt}T00:00:00.000Z`,
      authors: ["Finfold Editorial"],
      images: [{ url: visual.src, width: 1792, height: 1008, alt: visual.altEn }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [visual.src]
    }
  };
}

export default async function EnglishBlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildArticleSchema(post, "en")) }}
      />
      <BlogPostView post={post} initialLocale="en" localeHref={`/blog/${post.slug}`} />
    </>
  );
}
