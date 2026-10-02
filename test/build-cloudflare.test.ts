import { describe, expect, it } from "vitest";

import {
  buildCloudflareEnvironment,
  cloudflareBuildVarNames
} from "../scripts/build-cloudflare.mjs";

const validConfig = `
[vars]
FINFOLD_DEPLOYMENT_ENV = "production"
NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key"
NEXT_PUBLIC_APP_URL = "https://www.finfold.app"
NEXT_PUBLIC_TURNSTILE_SITE_KEY = "public-turnstile-key"
NEXT_PUBLIC_ALIPAY_QRCODE_IMAGE_URL = "https://project.supabase.co/storage/v1/object/public/public-assets/alipay.png"
NEXT_PUBLIC_ALIPAY_QRCODE_PAYEE_NAME = "Finfold"
NEXT_PUBLIC_POSTHOG_KEY = "phc_test-project-key"
NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com"
`;

describe("Cloudflare production build environment", () => {
  it("injects every build-time public variable from wrangler.toml", () => {
    const environment = buildCloudflareEnvironment(validConfig, {
      EXISTING_VALUE: "preserved",
      NEXT_PUBLIC_SUPABASE_URL: "https://stale.supabase.co",
      NEXT_PUBLIC_ALIPAY_QRCODE_IMAGE_URL: "https://stale.example.com/alipay.png"
    });

    expect(cloudflareBuildVarNames).toEqual([
      "FINFOLD_DEPLOYMENT_ENV",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      "NEXT_PUBLIC_ALIPAY_QRCODE_IMAGE_URL",
      "NEXT_PUBLIC_ALIPAY_QRCODE_PAYEE_NAME",
      "NEXT_PUBLIC_POSTHOG_KEY",
      "NEXT_PUBLIC_POSTHOG_HOST"
    ]);
    expect(environment).toMatchObject({
      EXISTING_VALUE: "preserved",
      FINFOLD_DEPLOYMENT_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
      NEXT_PUBLIC_APP_URL: "https://www.finfold.app",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "public-turnstile-key",
      NEXT_PUBLIC_ALIPAY_QRCODE_IMAGE_URL: "https://project.supabase.co/storage/v1/object/public/public-assets/alipay.png",
      NEXT_PUBLIC_ALIPAY_QRCODE_PAYEE_NAME: "Finfold",
      NEXT_PUBLIC_POSTHOG_KEY: "phc_test-project-key",
      NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      ALLOW_MOCK: "false",
      NEXT_PUBLIC_ALLOW_MOCK: "false"
    });
  });

  it.each(cloudflareBuildVarNames)("rejects a missing %s", (name) => {
    const invalidConfig = validConfig.replace(
      new RegExp(`^${name}\\s*=.*$`, "m"),
      ""
    );

    expect(() => buildCloudflareEnvironment(invalidConfig, {})).toThrow(name);
  });

  it("rejects a non-production deployment environment", () => {
    expect(() =>
      buildCloudflareEnvironment(
        validConfig.replace('FINFOLD_DEPLOYMENT_ENV = "production"', 'FINFOLD_DEPLOYMENT_ENV = "staging"'),
        {}
      )
    ).toThrow("must be production");
  });

  it("rejects a non-production app URL", () => {
    expect(() =>
      buildCloudflareEnvironment(
        validConfig.replace("https://www.finfold.app", "https://preview.example.com"),
        {}
      )
    ).toThrow("must be https://www.finfold.app");
  });

  it("rejects an invalid PostHog key or ingestion host", () => {
    expect(() =>
      buildCloudflareEnvironment(
        validConfig.replace("phc_test-project-key", "not-a-project-key"),
        {}
      )
    ).toThrow("PostHog project API key");
    expect(() =>
      buildCloudflareEnvironment(
        validConfig.replace("https://us.i.posthog.com", "https://eu.i.posthog.com"),
        {}
      )
    ).toThrow("must be https://us.i.posthog.com");
  });
});
