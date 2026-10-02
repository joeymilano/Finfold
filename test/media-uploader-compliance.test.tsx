import "@testing-library/jest-dom/vitest";
import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), toast: vi.fn(), capture: vi.fn() }));

vi.mock("@/lib/image-compliance-client", () => ({
  inspectImageCompliance: mocks.inspect,
  hasQrCodeRisk: (asset: { compliance?: { qrCode?: string } }) => asset.compliance?.qrCode === "detected"
}));
vi.mock("@/components/ui/Toast", () => ({ addToast: mocks.toast }));
vi.mock("@/lib/posthog", () => ({ captureEvent: mocks.capture }));

import { MediaUploader } from "@/components/workbench/MediaUploader";
import type { MediaAsset } from "@/lib/content-schema";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("MediaUploader Xiaohongshu compliance", () => {
  it("scans locally and marks the uploaded asset when a QR code is detected", async () => {
    mocks.inspect.mockResolvedValue({ qrCode: "detected" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ assets: [{ id: "asset-1", name: "qr.png", type: "image", size: 5 }] })
    }));
    const onChange = vi.fn();
    function Harness() {
      const [assets, setAssets] = useState<MediaAsset[]>([]);
      return (
        <MediaUploader
          assets={assets}
          onChange={(next) => { onChange(next); setAssets(next); }}
          locale="zh"
          selectedPlatforms={["xiaohongshu"]}
        />
      );
    }
    const { container } = render(
      <Harness />
    );

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [new File(["image"], "qr.png", { type: "image/png" })] } });

    expect(await screen.findByTestId("xhs-qr-upload-warning")).toHaveTextContent("检测到 1 张图片可能含二维码");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ compliance: { qrCode: "detected" } })
    ]));
    expect(mocks.toast).toHaveBeenCalledWith("warning", expect.stringContaining("疑似二维码"));
  });
});
