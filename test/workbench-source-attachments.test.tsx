import "@testing-library/jest-dom/vitest";
import React, { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IdeaInput } from "@/components/workbench/IdeaInput";
import type { AgentAttachment } from "@/lib/agent/attachments";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  toast: vi.fn()
}));

vi.mock("@/lib/posthog", () => ({ captureEvent: mocks.capture }));
vi.mock("@/components/ui/Toast", () => ({ addToast: mocks.toast }));
vi.mock("@/components/ui/SpeechInputButton", () => ({
  appendTranscript: (current: string, transcript: string) => `${current} ${transcript}`.trim(),
  SpeechInputButton: () => <button type="button">语音</button>
}));

beforeEach(() => {
  mocks.capture.mockReset();
  mocks.toast.mockReset();
  vi.unstubAllGlobals();
});

describe("Workbench source attachments", () => {
  it("uploads JSON through the private attachment route and exposes a removable source chip", async () => {
    const attachment: AgentAttachment = {
      id: "e32be8a3-73a6-4b3d-884e-8e508a509ec3",
      name: "products.json",
      size: 128,
      kind: "data",
      mimeType: "application/json",
      storagePath: "user-1/e32be8a3-73a6-4b3d-884e-8e508a509ec3.json"
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body as FormData;
      expect(body.getAll("files")).toHaveLength(1);
      return new Response(JSON.stringify({ attachments: [attachment] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    function Harness() {
      const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
      return (
        <IdeaInput
          value=""
          onChange={() => undefined}
          locale="zh"
          attachments={attachments}
          onAttachmentsChange={setAttachments}
        />
      );
    }

    render(<Harness />);
    const input = screen.getByLabelText("上传资料") as HTMLInputElement;
    expect(input.accept).toContain(".json");
    expect(input.accept).toContain(".xlsx");
    expect(input.accept).toContain(".mp4");

    await user.upload(input, new File(['{"product":"Finfold"}'], "products.json", { type: "application/json" }));

    await waitFor(() => expect(screen.getByText("products.json")).toBeInTheDocument());
    expect(screen.getByText("已添加 1 份源文件")).toBeInTheDocument();
    expect(mocks.capture).toHaveBeenCalledWith("workbench_source_attachments_added", expect.objectContaining({ count: 1 }));

    await user.click(screen.getByRole("button", { name: "移除源文件: products.json" }));
    expect(screen.queryByText("products.json")).not.toBeInTheDocument();
  });
});
