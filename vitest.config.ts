import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // tsconfig uses `jsx: "preserve"` for Next.js; esbuild would otherwise fall
  // back to the classic JSX runtime and require `import React` in every .tsx
  // file under test. Pin the automatic runtime so components render without it.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"]
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  }
});
