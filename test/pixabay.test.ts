import { describe, expect, it } from "vitest";
import {
  pixabayAssetFromHit,
  pixabayImageExtension,
  pixabayOrientationForCover,
  pixabayPreviewProxyUrl,
  type PixabayHit
} from "@/lib/cover/pixabay";
import { coverAssetAttribution } from "@/lib/cover/stock-assets";

const hit: PixabayHit = {
  id: 195893,
  pageURL: "https://pixabay.com/photos/blossom-bloom-flower-195893/",
  type: "photo",
  tags: "blossom, bloom, flower",
  previewURL: "https://cdn.pixabay.com/photo/flower_150.jpg",
  previewWidth: 150,
  previewHeight: 84,
  webformatURL: "https://pixabay.com/get/flower_640.jpg",
  webformatWidth: 640,
  webformatHeight: 360,
  largeImageURL: "https://pixabay.com/get/flower_1280.jpg",
  imageWidth: 1280,
  imageHeight: 720,
  user: "Jo Example",
  user_id: 42
};

describe("Pixabay cover assets", () => {
  it("uses Pixabay only as a temporary preview and swaps to Finfold storage after selection", () => {
    const preview = pixabayAssetFromHit(hit);
    const persisted = pixabayAssetFromHit(hit, "https://project.supabase.co/storage/v1/object/public/media/stock/pixabay/195893.jpg");

    expect(preview.provider).toBe("pixabay");
    expect(preview.url).toBe(hit.largeImageURL);
    expect(preview.previewUrl).toBe(hit.previewURL);
    expect(persisted.url).toContain("/media/stock/pixabay/195893.jpg");
    expect(persisted.previewUrl).toBe(persisted.url);
    expect(pixabayPreviewProxyUrl(hit.previewURL)).toContain(encodeURIComponent(hit.previewURL));
  });

  it("preserves provider attribution and maps cover dimensions to Pixabay's filters", () => {
    const asset = pixabayAssetFromHit(hit);
    expect(coverAssetAttribution(asset, "en")).toBe("Image by Jo Example from Pixabay");
    expect(coverAssetAttribution(asset, "zh")).toBe("图片作者：Jo Example · Pixabay");
    expect(pixabayOrientationForCover("portrait")).toBe("vertical");
    expect(pixabayOrientationForCover("landscape")).toBe("horizontal");
    expect(pixabayOrientationForCover("square")).toBe("all");
  });

  it("uses a safe media extension for the cached source", () => {
    expect(pixabayImageExtension(hit.largeImageURL)).toBe("jpg");
    expect(pixabayImageExtension("https://cdn.pixabay.com/photo/texture.webp")).toBe("webp");
    expect(pixabayImageExtension("not a url")).toBe("jpg");
  });
});
