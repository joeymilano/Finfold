#!/usr/bin/env node
/**
 * Generate browser-tab favicons with a tab-specific Finfold lockup.
 *
 * The app icon is deliberately spacious, but that makes the fish itself only
 * about 64% wide in a 16px browser tab. For favicons we keep the dark rounded
 * tile while scaling the fish mark to about 88% of the canvas. This is a
 * separate asset treatment: the in-product logo and Apple icon stay unchanged.
 *
 * Run: node scripts/generate-favicons.mjs
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const PUBLIC_DIR = join(process.cwd(), "public");
const BRAND_DIR = join(PUBLIC_DIR, "brand");
const MARK_SOURCE = join(BRAND_DIR, "fish-mark-light.png");
const MASTER_SIZE = 768;
const MARK_CROP = { left: 230, top: 445, width: 800, height: 360 };
const MARK_WIDTH = 740;
const MARK_HEIGHT = 333;
const MARK_LEFT = Math.round((MASTER_SIZE - MARK_WIDTH) / 2);
const MARK_TOP = Math.round((MASTER_SIZE - MARK_HEIGHT) / 2);
const PNG_SIZES = [48, 96, 144, 192];
const ICO_SIZES = [16, 32, 48];

const backgroundSvg = Buffer.from(`
  <svg width="${MASTER_SIZE}" height="${MASTER_SIZE}" viewBox="0 0 ${MASTER_SIZE} ${MASTER_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#272c35" />
        <stop offset="0.55" stop-color="#171b21" />
        <stop offset="1" stop-color="#0c0f13" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="762" height="762" rx="164" fill="url(#tile)" stroke="#70757d" stroke-width="6" />
  </svg>
`);

async function createMasterIcon() {
  const markMask = await sharp(MARK_SOURCE)
    .extract(MARK_CROP)
    .greyscale()
    .negate()
    .threshold(82)
    .resize(MARK_WIDTH, MARK_HEIGHT, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .toBuffer();

  const mark = await sharp({
    create: {
      width: MARK_WIDTH,
      height: MARK_HEIGHT,
      channels: 3,
      background: "#f4efe3",
    },
  })
    .joinChannel(markMask)
    .png()
    .toBuffer();

  const eyeX = Math.round(
    MARK_LEFT + ((399 - MARK_CROP.left) / MARK_CROP.width) * MARK_WIDTH,
  );
  const eyeY = Math.round(
    MARK_TOP + ((586 - MARK_CROP.top) / MARK_CROP.height) * MARK_HEIGHT,
  );
  const eyeSvg = Buffer.from(`
    <svg width="${MASTER_SIZE}" height="${MASTER_SIZE}" viewBox="0 0 ${MASTER_SIZE} ${MASTER_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${eyeX}" cy="${eyeY}" r="20" fill="#91d12d" />
    </svg>
  `);

  return sharp(backgroundSvg)
    .composite([
      { input: mark, left: MARK_LEFT, top: MARK_TOP },
      { input: eyeSvg, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

const masterIcon = await createMasterIcon();

const renderPng = (size) =>
  sharp(masterIcon)
    .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

function createIco(images) {
  const headerSize = 6;
  const directoryEntrySize = 16;
  const dataOffset = headerSize + directoryEntrySize * images.length;
  const header = Buffer.alloc(dataOffset);

  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // image type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = dataOffset;
  images.forEach(({ size, png }, index) => {
    const entry = headerSize + index * directoryEntrySize;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2); // palette colors
    header.writeUInt8(0, entry + 3); // reserved
    header.writeUInt16LE(1, entry + 4); // color planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });

  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

for (const size of PNG_SIZES) {
  const output = join(BRAND_DIR, `favicon-tab-v2-${size}.png`);
  await writeFile(output, await renderPng(size));
  console.log(`generated ${output}`);
}

const icoImages = await Promise.all(
  ICO_SIZES.map(async (size) => ({ size, png: await renderPng(size) })),
);
await writeFile(join(PUBLIC_DIR, "favicon.ico"), createIco(icoImages));
console.log(`generated ${join(PUBLIC_DIR, "favicon.ico")}`);
