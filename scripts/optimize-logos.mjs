#!/usr/bin/env node
/**
 * optimize-logos.mjs — compress Finfold brand PNGs into tiny AVIF + WebP.
 *
 * Background: brand logos render at 32-40px in the app shell but the source
 * PNGs are 680KB–1.1MB each (1254px). This script produces retina-ready
 * AVIF (modern browsers) + WebP (fallback) variants at the size we actually
 * need, shrinking each asset by ~95%+.
 *
 * Run:  node scripts/optimize-logos.mjs
 *
 * Originals are kept on disk (untouched) as a backup / design source.
 */
import sharp from "sharp";
import { stat, access } from "node:fs/promises";
import { join } from "node:path";

const BRAND_DIR = join(process.cwd(), "public/brand");

// src = original PNG, out = output basename, width = max render width.
// Square marks render at 40px (3x retina = 120px) → 256px is ample.
// Wordmark is wider; keep 640px width for crisp retina on large sidebars.
const targets = [
  { src: "fish-mark-light.png", out: "fish-mark-light", width: 256 },
  { src: "app-icon-transparent.png", out: "app-icon-light", width: 256 },
  { src: "app-icon-dark.png", out: "app-icon-dark", width: 256 },
  { src: "app-icon.png", out: "app-icon-full", width: 256 },
  { src: "logo-horizontal-light.png", out: "wordmark-light", width: 640 },
  { src: "logo-lockup-light-dark.png", out: "lockup", width: 640 },
];

const kb = (n) => (n / 1024).toFixed(1) + " KB";
const stats = [];

for (const t of targets) {
  const srcPath = join(BRAND_DIR, t.src);
  try {
    await access(srcPath);
  } catch {
    console.warn(`skip (missing): ${t.src}`);
    continue;
  }

  const before = (await stat(srcPath)).size;
  const pipeline = sharp(srcPath)
    .rotate() // honor EXIF orientation
    .resize({ width: t.width, fit: "inside", withoutEnlargement: true });

  const webpPath = join(BRAND_DIR, `${t.out}-${t.width}.webp`);
  const avifPath = join(BRAND_DIR, `${t.out}-${t.width}.avif`);

  await pipeline
    .clone()
    .webp({ quality: 85, effort: 4 })
    .toFile(webpPath);
  await pipeline
    .clone()
    .avif({ quality: 55, effort: 2, chromaSubsampling: "4:2:0" })
    .toFile(avifPath);

  stats.push({
    src: t.src,
    width: t.width,
    before,
    webp: (await stat(webpPath)).size,
    avif: (await stat(avifPath)).size,
  });
}

console.log("\n=== LOGO optimization report ===");
console.log("source".padEnd(34), "before".padStart(12), "webp".padStart(10), "avif".padStart(10), "reduction".padStart(11));
for (const s of stats) {
  const reduction = ((1 - s.avif / s.before) * 100).toFixed(0);
  console.log(
    s.src.padEnd(34),
    kb(s.before).padStart(12),
    kb(s.webp).padStart(10),
    kb(s.avif).padStart(10),
    (`-${reduction}%`).padStart(11),
  );
}
console.log(`\nDone. ${stats.length} sources → AVIF+WebP.`);
