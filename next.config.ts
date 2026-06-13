import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: projectRoot,
  // Required for @cloudflare/next-on-pages
  experimental: {
    // Ensures compatibility checks run during build
  }
};

export default nextConfig;
