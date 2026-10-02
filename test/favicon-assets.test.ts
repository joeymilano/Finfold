import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const publicDir = join(process.cwd(), "public");
const faviconSizes = [48, 96, 144, 192];

describe("favicon assets", () => {
  it.each(faviconSizes)("ships a large, legible fish mark at %dpx", async (size) => {
    const iconPath = join(publicDir, "brand", `favicon-tab-v2-${size}.png`);
    const { data, info } = await sharp(iconPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(info.width).toBe(size);
    expect(info.height).toBe(size);

    let tileMinX = size;
    let tileMinY = size;
    let tileMaxX = -1;
    let tileMaxY = -1;
    let markMinX = size;
    let markMinY = size;
    let markMaxX = -1;
    let markMaxY = -1;

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const alpha = data[offset + 3];

        if (alpha >= 32) {
          tileMinX = Math.min(tileMinX, x);
          tileMinY = Math.min(tileMinY, y);
          tileMaxX = Math.max(tileMaxX, x);
          tileMaxY = Math.max(tileMaxY, y);
        }

        const isCreamMark = red > 180 && green > 170 && blue > 145;
        const isGreenEye = green > red * 1.15 && green > blue * 1.15 && green > 90;
        if (alpha < 32 || (!isCreamMark && !isGreenEye)) continue;
        markMinX = Math.min(markMinX, x);
        markMinY = Math.min(markMinY, y);
        markMaxX = Math.max(markMaxX, x);
        markMaxY = Math.max(markMaxY, y);
      }
    }

    expect((tileMaxX - tileMinX + 1) / size).toBeGreaterThanOrEqual(0.98);
    expect((tileMaxY - tileMinY + 1) / size).toBeGreaterThanOrEqual(0.98);
    expect((markMaxX - markMinX + 1) / size).toBeGreaterThanOrEqual(0.84);
    expect((markMaxY - markMinY + 1) / size).toBeGreaterThanOrEqual(0.34);
  });

  it("keeps 16px, 32px, and 48px browser fallbacks in favicon.ico", async () => {
    const ico = await readFile(join(publicDir, "favicon.ico"));
    const imageCount = ico.readUInt16LE(4);
    const sizes = Array.from({ length: imageCount }, (_, index) => {
      const width = ico.readUInt8(6 + index * 16);
      return width === 0 ? 256 : width;
    });

    expect(sizes).toEqual([16, 32, 48]);
  });
});
