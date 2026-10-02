import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ jsQr: vi.fn() }));

vi.mock("jsqr", () => ({ default: mocks.jsQr }));

import { inspectImageCompliance } from "@/lib/image-compliance-client";

describe("image compliance QR scanning", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.jsQr.mockReset();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({
      width: 640,
      height: 480,
      close: vi.fn()
    }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(640 * 480 * 4) })
    }) as never);
  });

  it("flags an image when jsQR recognizes a code", async () => {
    mocks.jsQr.mockReturnValue({ data: "https://example.com" });

    await expect(inspectImageCompliance(new Blob(["image"]))).resolves.toEqual({ qrCode: "detected" });
    expect(mocks.jsQr).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 640, 480, { inversionAttempts: "attemptBoth" });
  });

  it("does not retain or expose decoded QR contents", async () => {
    mocks.jsQr.mockReturnValue({ data: "sensitive-payload" });

    const result = await inspectImageCompliance(new Blob(["image"]));
    expect(result).toEqual({ qrCode: "detected" });
    expect(result).not.toHaveProperty("data");
  });

  it("reports unavailable instead of blocking when pixels cannot be read", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);

    await expect(inspectImageCompliance(new Blob(["image"]))).resolves.toEqual({ qrCode: "unavailable" });
  });
});
