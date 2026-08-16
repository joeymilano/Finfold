import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "./package.json";

const projectRoot = dirname(fileURLToPath(import.meta.url));

// Supabase Storage hosts user avatars. Whitelist its host so the next/image
// optimizer is *allowed* to fetch it wherever the optimizer actually runs.
// Supabase Storage is the only remote source the Next image pipeline may fetch.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : null;

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: projectRoot,
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version
  },
  images: {
    // Prefer AVIF then WebP whenever the optimizer transforms an image.
    formats: ["image/avif", "image/webp"],
    remotePatterns: supabaseHost
      ? [{ protocol: "https" as const, hostname: supabaseHost }]
      : [],
    // Optimized outputs are content-addressed by url+w+q, so they can be
    // cached aggressively. 24h matches the avatar cache-bust cadence.
    minimumCacheTTL: 60 * 60 * 24
  }
};

export default nextConfig;
