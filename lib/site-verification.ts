import type { Metadata } from "next";

export function buildSiteVerification(
  env: Readonly<Record<string, string | undefined>> = process.env
): Metadata["verification"] {
  const other = {
    ...(env.BING_SITE_VERIFICATION ? { "msvalidate.01": env.BING_SITE_VERIFICATION } : {}),
    ...(env.BAIDU_SITE_VERIFICATION
      ? { "baidu-site-verification": env.BAIDU_SITE_VERIFICATION }
      : {})
  };

  return Object.keys(other).length > 0 ? { other } : undefined;
}
