import { brand } from "@/lib/brand";
import type { UseCasePageConfig } from "@/lib/use-case-pages";

export function buildUseCaseSchema(config: UseCasePageConfig, locale: "zh" | "en") {
  const isEn = locale === "en";
  const prefix = isEn ? "/en" : "";
  const url = `${brand.siteUrl}${prefix}/use-cases/${config.slug}`;
  const name = isEn
    ? (config.searchTitleEn ?? config.titleEn)
    : (config.searchTitleZh ?? config.titleZh);
  const description = isEn
    ? (config.searchDescriptionEn ?? config.descriptionEn)
    : (config.searchDescriptionZh ?? config.descriptionZh);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name,
        description,
        url,
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: `${brand.siteUrl}${config.image}`,
          caption: isEn ? config.imageAltEn : config.imageAltZh
        },
        inLanguage: isEn ? "en" : "zh-CN",
        dateModified: config.updatedAt,
        about: {
          "@type": "SoftwareApplication",
          name: brand.name,
          url: brand.siteUrl,
          applicationCategory: "BusinessApplication"
        }
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: isEn ? "Home" : "首页",
            item: `${brand.siteUrl}${prefix || "/"}`
          },
          {
            "@type": "ListItem",
            position: 2,
            name: isEn ? "Use cases" : "使用场景",
            item: `${brand.siteUrl}${prefix}/use-cases`
          },
          {
            "@type": "ListItem",
            position: 3,
            name: isEn ? config.eyebrowEn : config.eyebrowZh,
            item: url
          }
        ]
      },
      {
        "@type": "FAQPage",
        mainEntity: config.faqs.map((faq) => ({
          "@type": "Question",
          name: isEn ? faq.questionEn : faq.questionZh,
          acceptedAnswer: {
            "@type": "Answer",
            text: isEn ? faq.answerEn : faq.answerZh
          }
        }))
      }
    ]
  };
}
