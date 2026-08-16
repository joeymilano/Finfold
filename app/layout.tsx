import type { Metadata } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Fraunces, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import { brand } from "@/lib/brand";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { LOCALE_INIT_SCRIPT } from "@/lib/locale-init";
import { PostHogInit } from "@/components/analytics/PostHogInit";

// Display face for the marketing site — "The Studio Floor" editorial voice.
// Fraunces (variable, with SOFT/WONK axes) handles Latin display type; its
// italic is the signature accent for mixed-case headlines. OFL licensed.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
  preload: true
});

// Serif display face for Editorial-style social covers (lib/cover) and
// Chinese display headlines. Google serves it pre-sliced by unicode range,
// so only glyphs actually rendered get fetched.
const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["500", "600", "900"],
  variable: "--font-cover-serif",
  display: "swap",
  preload: false
});

export const metadata: Metadata = {
  title: brand.name,
  applicationName: brand.name,
  description: `${brand.slogan} ${brand.description}`,
  metadataBase: new URL(brand.siteUrl ?? "https://www.finfold.app"),
  icons: {
    // Browser chrome is often dark, so the favicon uses the rimmed version
    // that stays visible on dark surfaces; apple-touch-icon keeps the
    // opaque original since iOS forbids transparency.
    icon: [{ url: "/brand/app-icon-dark.png", type: "image/png" }],
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
  verification: process.env.BING_SITE_VERIFICATION
    ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } }
    : undefined
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      data-theme="dark"
      data-scroll-behavior="smooth"
      className={`${GeistSans.variable} ${GeistMono.variable} ${notoSerifSC.variable} ${fraunces.variable}`}
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
        <PostHogInit />
        {children}
      </body>
    </html>
  );
}
