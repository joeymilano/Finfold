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

const archivedBlogRedirects = [
  ["x-twitter-algorithm-playbook", "content-compounding-founder-system"],
  ["linkedin-algorithm-playbook", "content-compounding-founder-system"],
  ["xiaohongshu-algorithm-playbook", "content-compounding-founder-system"],
  ["reddit-algorithm-playbook", "reddit-post-patterns-popsy-ai"],
  ["product-changelog-to-linkedin-post", "content-compounding-founder-system"],
  ["product-hunt-maker-comment-guide", "validate-demand-before-building"],
  ["ai-marketing-agent-vs-automation", "content-compounding-founder-system"],
  ["ai-marketing-for-small-business-without-content-team", "content-compounding-founder-system"],
  ["human-reviewed-ai-social-media-manager", "content-compounding-founder-system"],
  ["content-repurposing-workflow", "content-compounding-founder-system"]
] as const;

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: projectRoot,
  async redirects() {
    return archivedBlogRedirects.flatMap(([source, destination]) => [
      {
        source: `/blog/${source}`,
        destination: `/blog/${destination}`,
        permanent: true
      },
      {
        source: `/en/blog/${source}`,
        destination: `/en/blog/${destination}`,
        permanent: true
      }
    ]);
  },
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
