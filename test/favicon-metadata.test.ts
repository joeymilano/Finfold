import { describe, expect, it, vi } from "vitest";

vi.mock("geist/font/sans", () => ({
  GeistSans: { variable: "mock-geist-sans" }
}));

vi.mock("geist/font/mono", () => ({
  GeistMono: { variable: "mock-geist-mono" }
}));

vi.mock("next/font/google", () => ({
  Noto_Serif_SC: () => ({ variable: "mock-cover-serif" }),
  Fraunces: () => ({ variable: "mock-fraunces" })
}));

import { metadata } from "@/app/layout";
import { buildSiteVerification } from "@/lib/site-verification";

describe("root metadata", () => {
  it("declares Google-compliant favicons (48px multiples with sizes)", () => {
    expect(metadata.icons).toEqual({
      icon: [
        { url: "/brand/favicon-tab-v2-48.png", sizes: "48x48", type: "image/png" },
        { url: "/brand/favicon-tab-v2-96.png", sizes: "96x96", type: "image/png" },
        { url: "/brand/favicon-tab-v2-144.png", sizes: "144x144", type: "image/png" },
        { url: "/brand/favicon-tab-v2-192.png", sizes: "192x192", type: "image/png" }
      ],
      apple: [{ url: "/brand/app-icon.png", type: "image/png" }]
    });
  });

  it("renders independent Bing and Baidu ownership tags when configured", () => {
    expect(buildSiteVerification({
      BING_SITE_VERIFICATION: "bing-code",
      BAIDU_SITE_VERIFICATION: "baidu-code"
    })).toEqual({
      other: {
        "msvalidate.01": "bing-code",
        "baidu-site-verification": "baidu-code"
      }
    });
    expect(buildSiteVerification({
      BING_SITE_VERIFICATION: undefined,
      BAIDU_SITE_VERIFICATION: undefined
    })).toBeUndefined();
  });
});
