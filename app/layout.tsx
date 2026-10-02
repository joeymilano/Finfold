import type { Metadata } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
// Self-hosted via @fontsource npm packages: the font files ship with the
// repo, so builds never fetch Google Fonts at compile time (the studio
// network cannot reach fonts.gstatic.com reliably). Noto Serif SC keeps
// Google's official unicode-range slicing — browsers only fetch the glyph
// slices actually rendered. Both families remain first-party hosted.
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource/noto-serif-sc/500.css";
import "@fontsource/noto-serif-sc/600.css";
import "@fontsource/noto-serif-sc/900.css";
import "./globals.css";
import { brand } from "@/lib/brand";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { LOCALE_INIT_SCRIPT } from "@/lib/locale-init";
import { PostHogInit } from "@/components/analytics/PostHogInit";
import { AuthUserProvider } from "@/components/auth/AuthUserProvider";

import { buildSiteVerification } from "@/lib/site-verification";

export const metadata: Metadata = {
  title: brand.name,
  applicationName: brand.name,
  robots: process.env.FINFOLD_DEPLOYMENT_ENV === "staging"
    ? { index: false, follow: false }
    : undefined,
  description: `${brand.slogan} ${brand.description}`,
  metadataBase: new URL(brand.siteUrl ?? "https://www.finfold.app"),
  icons: {
    // Google Search requires favicons to be square multiples of 48px and
    // prefers explicit sizes; the 711KB source PNG was rejected/skipped, so
    // the tab-specific dark variant enlarges the fish itself to about 90% of
    // the canvas. The versioned path also prevents browsers from reusing the
    // earlier small-mark asset; /favicon.ico remains the crawler fallback.
    // apple-touch-icon keeps the opaque original since iOS forbids transparency.
    icon: [
      { url: "/brand/favicon-tab-v2-48.png", sizes: "48x48", type: "image/png" },
      { url: "/brand/favicon-tab-v2-96.png", sizes: "96x96", type: "image/png" },
      { url: "/brand/favicon-tab-v2-144.png", sizes: "144x144", type: "image/png" },
      { url: "/brand/favicon-tab-v2-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/brand/app-icon.png", type: "image/png" }]
  },
  openGraph: {
    title: `${brand.name} — ${brand.slogan}`,
    description: brand.description,
    siteName: brand.name,
    type: "website",
    images: [brand.socialImage]
  },
  twitter: {
    card: "summary_large_image",
    title: `${brand.name} — ${brand.slogan}`,
    description: brand.description,
    images: [brand.socialImage.url]
  },
  verification: buildSiteVerification()
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      data-theme="dark"
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Google Analytics 4 — sitewide measurement ID. */}
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-N3XZJRJ4M5" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-N3XZJRJ4M5');`}
        </Script>
        {/* Warm the Supabase Storage connection so the avatar (fetched
            client-side once /api/auth/user resolves) doesn't pay full
            DNS + TLS latency on first paint. */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL ? (
          <link
            rel="preconnect"
            href={new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin}
          />
        ) : null}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <AuthUserProvider>
          <PostHogInit />
          {children}
        </AuthUserProvider>
      </body>
    </html>
  );
}
