import { mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import sharp from "sharp";
import { defineConfig } from "vite";

const projectRoot = resolve(import.meta.dirname, "../..");

export default defineConfig(() => {
  // VITE_STORE_BUILD=1 produces the Chrome Web Store zip: the reply assistant
  // (DOM automation on social sites) is swapped for inert stubs at resolve
  // time, which excludes it from the bundle regardless of tree-shaking.
  const store = process.env.VITE_STORE_BUILD === "1";
  return {
    plugins: [
      react(),
      {
        name: "finfold-packaged-assets",
        async closeBundle() {
          const iconDir = resolve(import.meta.dirname, "dist/icons");
          await mkdir(iconDir, { recursive: true });
          await copyFile(resolve(import.meta.dirname, "src/assets/Geist-LICENSE.txt"), resolve(import.meta.dirname, "dist/Geist-LICENSE.txt"));
          const source = resolve(projectRoot, "public/brand/app-icon-light-256.webp");
          await Promise.all([16, 32, 48, 128].map((size) =>
            sharp(source).resize(size, size, { fit: "contain" }).toFile(resolve(iconDir, `icon-${size}.png`))
          ));
        }
      }
    ],
    resolve: store ? {
      alias: [
        { find: "./automation", replacement: resolve(import.meta.dirname, "src/store-stubs/automation.ts") },
        { find: "./ReplyPanel", replacement: resolve(import.meta.dirname, "src/store-stubs/ReplyPanel.tsx") }
      ]
    } : undefined,
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input: {
          sidepanel: resolve(import.meta.dirname, "sidepanel.html"),
          background: resolve(import.meta.dirname, "src/background.ts")
        },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]"
        }
      }
    }
  };
});
