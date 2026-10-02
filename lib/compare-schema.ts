import { brand } from "@/lib/brand";
import type { ComparePageConfig } from "@/lib/compare-pages";

export function buildCompareSchema(config: ComparePageConfig) {
  const url = `${brand.siteUrl}/en/compare/${config.slug}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: config.title,
        description: config.description,
        url,
        inLanguage: "en",
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
            name: "Home",
            item: `${brand.siteUrl}/en`
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Compare",
            item: `${brand.siteUrl}/en`
          },
          {
            "@type": "ListItem",
            position: 3,
            name: config.title,
            item: url
          }
        ]
      },
      {
        "@type": "FAQPage",
        mainEntity: config.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer
          }
        }))
      }
    ]
  };
}
