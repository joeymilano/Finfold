"use client";

import Link from "next/link";
import { FishLogo } from "@/components/app-shell/FishLogo";
import { LocaleToggle } from "@/components/theme/LocaleToggle";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { useLocale } from "@/hooks/useLocale";
import type { LegalDoc } from "@/lib/legal";

/**
 * Renders a single legal document (Privacy / Terms / Refund) in the current
 * locale. The server pages that mount this pass the full doc, so the zh
 * version is present in the initial SSR HTML and remains crawlable.
 */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const locale = useLocale();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-hairline bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/" className="focus-ring flex items-center gap-2 rounded-md">
            <FishLogo variant="app-icon" className="h-6 w-6 rounded-[22%] object-cover" />
            <span className="text-sm font-bold text-fg">Finfold</span>
          </Link>
          <LocaleToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12">
        <h1 className="text-2xl font-bold text-fg sm:text-3xl">{doc.title[locale]}</h1>
        <p className="mt-2 text-sm text-fg-muted">{doc.description[locale]}</p>

        <div className="mt-10 space-y-9">
          {doc.sections.map((section) => (
            <section key={section.heading.en}>
              <h2 className="text-base font-bold text-fg sm:text-lg">{section.heading[locale]}</h2>
              <div className="mt-3 space-y-3">
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-fg-muted">
                    {p[locale]}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
