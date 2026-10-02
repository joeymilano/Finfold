import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IdeaInput } from "@/components/workbench/IdeaInput";

const mocks = vi.hoisted(() => ({ capture: vi.fn(), toast: vi.fn() }));

vi.mock("@/lib/posthog", () => ({ captureEvent: mocks.capture }));
vi.mock("@/components/ui/Toast", () => ({ addToast: mocks.toast }));
vi.mock("@/components/ui/SpeechInputButton", () => ({
  appendTranscript: (current: string, transcript: string) => `${current} ${transcript}`.trim(),
  SpeechInputButton: () => <button type="button">语音</button>
}));

function imageResponse(summary: string, keyPoints: string[]) {
  return new Response(JSON.stringify({ summary, keyPoints }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function renderInput(onChange: (value: string) => void = () => undefined) {
  render(<IdeaInput value="" onChange={onChange} locale="zh" />);
  return screen.getByLabelText("图片理解") as HTMLInputElement;
}

beforeEach(() => {
  mocks.capture.mockReset();
  mocks.toast.mockReset();
  vi.unstubAllGlobals();
  // jsdom 未实现 object URL，图片预览依赖它，这里用稳定桩替代。
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => "blob:preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
});

describe("IdeaInput image capture controls", () => {
  it("shows retry and remove controls once points land, and remove clears the panel", async () => {
    const fetchMock = vi.fn(async () => imageResponse("设计稿要点", ["深色主题", "卡片式布局"]));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const input = renderInput();
    await user.upload(input, new File(["fake-image"], "mockup.png", { type: "image/png" }));

    await waitFor(() => expect(screen.getByText("设计稿要点")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "重新理解" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除图片" })).toBeInTheDocument();
    expect(screen.getByTestId("captured-image-preview")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "移除图片" }));

    expect(screen.queryByText("设计稿要点")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新理解" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "移除图片" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("captured-image-preview")).not.toBeInTheDocument();
  });

  it("re-runs image understanding on retry and replaces the previous points", async () => {
    const responses = [
      imageResponse("第一版要点", ["第一版内容"]),
      imageResponse("第二版要点", ["第二版内容"])
    ];
    const fetchMock = vi.fn(async () => responses.shift() ?? imageResponse("fallback", []));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const input = renderInput();
    await user.upload(input, new File(["fake-image"], "mockup.png", { type: "image/png" }));
    await waitFor(() => expect(screen.getByText("第一版内容")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "重新理解" }));

    await waitFor(() => expect(screen.getByText("第二版内容")).toBeInTheDocument());
    expect(screen.queryByText("第一版内容")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a retry entry after a failed attempt and recovers on retry", async () => {
    const responses = [
      new Response(JSON.stringify({ code: "no_usable_content", error: "no usable content" }), {
        status: 422,
        headers: { "Content-Type": "application/json" }
      }),
      imageResponse("重试后的要点", ["重试成功内容"])
    ];
    const fetchMock = vi.fn(async () => responses.shift() ?? imageResponse("fallback", []));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const input = renderInput();
    await user.upload(input, new File(["fake-image"], "mockup.png", { type: "image/png" }));

    await waitFor(() => expect(screen.getByText("没能从这张图理解到内容，换张图或直接描述。")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "移除图片" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新理解" }));

    await waitFor(() => expect(screen.getByText("重试成功内容")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "移除图片" })).toBeInTheDocument();
  });
});
