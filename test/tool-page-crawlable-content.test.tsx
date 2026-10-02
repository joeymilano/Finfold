import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolPage } from "@/components/tools/ToolPage";
import { toolPages } from "@/lib/tool-pages";

describe("tool page content before hydration", () => {
  for (const locale of ["en", "zh"] as const) {
    it(`renders the answer and use cases in ${locale} without client effects`, () => {
      for (const config of toolPages) {
        const html = renderToStaticMarkup(<ToolPage config={config} initialLocale={locale} />);
        const doc = new DOMParser().parseFromString(html, "text/html");
        const hero = doc.querySelector("h1")?.closest("section");
        expect(hero?.textContent).toContain(locale === "en" ? config.directAnswerEn : config.directAnswerZh);
        for (const useCase of locale === "en" ? config.bestForEn : config.bestForZh) {
          expect(doc.querySelector("main")?.textContent).toContain(useCase);
        }
        expect(doc.querySelector("textarea")).not.toBeNull();
        if (locale === "en") {
          expect(doc.querySelector('a[href="/en/compare/multi-channel"]')).not.toBeNull();
        }
      }
    });
  }
});
