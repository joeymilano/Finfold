import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoverStudio } from "@/components/workbench/cover/CoverStudio";
import type { KitOutput } from "@/lib/content-schema";

const mocks = vi.hoisted(() => ({ exportCoverPng: vi.fn() }));

vi.mock("@/components/workbench/cover/CoverCanvas", () => ({
  CoverCanvas: () => <div data-testid="cover-canvas" />
}));
vi.mock("@/lib/cover/cover-export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cover/cover-export")>()),
  exportCoverPng: mocks.exportCoverPng
}));

const output: KitOutput = {
  id: "cover-output-1",
  platform: "linkedin",
  title: "A finished launch note",
  body: "A ready-to-share product update.",
  cta: "Read the full update",
  notes: "Keep the visual clear.",
  strategy: "Lead with the customer result.",
  locked: false,
  publishStatus: "draft",
  userEdited: false
};

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.exportCoverPng.mockReset();
});

describe("CoverStudio dismissal", () => {
  it("keeps a visible close action and supports Escape and backdrop dismissal", () => {
    const onClose = vi.fn();
    render(<CoverStudio output={output} platform="linkedin" locale="zh" onClose={onClose} />);

    const dialog = screen.getByRole("dialog", { name: "设计封面" });
    const closeButton = screen.getByRole("button", { name: "关闭封面设计" });
    expect(closeButton).toHaveAttribute("title", "关闭");
    expect(closeButton.querySelector('[data-fin-icon="X"]')).toBeInTheDocument();

    fireEvent.click(closeButton);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(dialog);

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("stores an AI visual on its content kit as soon as it is generated", async () => {
    const onSaveCover = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: "https://media.example/generated-cover.png" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ imageUrl: "https://media.example/generated-cover.png" }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<CoverStudio output={output} platform="linkedin" locale="zh" kitId="kit-1" onClose={vi.fn()} onSaveCover={onSaveCover} />);
    fireEvent.click(screen.getByRole("button", { name: "AI 图片" }));
    fireEvent.click(screen.getByRole("button", { name: "生成 AI 视觉" }));

    await waitFor(() => expect(onSaveCover).toHaveBeenCalledWith(
      "https://media.example/generated-cover.png",
      expect.objectContaining({ provider: "ai", rightsStatus: "generated", renderStatus: "ready" })
    ));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/kits/kit-1/outputs/cover-output-1/cover",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(expect.objectContaining({
      imageUrl: "https://media.example/generated-cover.png",
      imageSource: expect.objectContaining({ provider: "ai", rightsStatus: "generated" })
    }));
  });

  it("locks cover controls while an export is rendering", async () => {
    mocks.exportCoverPng.mockImplementation(() => new Promise<void>(() => undefined));
    render(<CoverStudio output={output} platform="linkedin" locale="zh" onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "下载 PNG" }));

    expect(await screen.findByTestId("cover-studio-busy-overlay")).toBeInTheDocument();
  });

  it("uses the first available stock provider instead of waiting on a broken default", async () => {
    const pixabayAsset = {
      id: "pixabay-42",
      url: "https://pixabay.example/photo.jpg",
      previewUrl: "https://pixabay.example/preview.jpg",
      width: 1200,
      height: 1600,
      alt: "Fast stock result",
      provider: "pixabay",
      licenseName: "Pixabay Content License",
      attributionRequired: false
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/stock/pexels")) {
        return new Response(JSON.stringify({ configured: false, assets: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ configured: true, assets: [pixabayAsset] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CoverStudio output={output} platform="linkedin" locale="zh" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "图库" }));

    expect(await screen.findByAltText("Fast stock result")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pixabay" })).toHaveAttribute("aria-pressed", "true");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
