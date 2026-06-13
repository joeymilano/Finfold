import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { brand } from "@/lib/brand";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { LOCALE_INIT_SCRIPT } from "@/lib/locale-init";

export const metadata: Metadata = {
  title: brand.name,
  description: `${brand.slogan} ${brand.description}`,
  metadataBase: new URL(brand.siteUrl ?? "https://finfold.pages.dev"),
  openGraph: {
    title: `${brand.name} — ${brand.slogan}`,
    description: brand.description,
    siteName: brand.name,
    type: "website",
    images: [{ url: "/brand/og-default.png", width: 1200, height: 630, alt: brand.name }]
  },
  twitter: {
    card: "summary_large_image",
    title: `${brand.name} — ${brand.slogan}`,
    description: brand.description
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" className={GeistSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
