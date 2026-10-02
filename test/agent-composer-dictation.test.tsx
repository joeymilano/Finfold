import "@testing-library/jest-dom/vitest";
import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentComposer } from "@/components/app-shell/AgentComposer";

class FakeSpeechRecognition {
  static instance: FakeSpeechRecognition | null = null;

  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  }) => void) | null = null;
  onerror = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    FakeSpeechRecognition.instance = this;
  }
}

function ComposerHarness() {
  const [value, setValue] = useState("Existing brief");
  return (
    <AgentComposer
      locale="en"
      value={value}
      onChange={setValue}
      onSubmit={vi.fn()}
      sending={false}
      onStop={vi.fn()}
      onFiles={vi.fn()}
      placeholder="Ask Finfold"
      compact
    />
  );
}

afterEach(() => {
  delete (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  FakeSpeechRecognition.instance = null;
});

function allowMicrophone() {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }]
      })
    }
  });
}

describe("Agent Composer dictation rail", () => {
  it("places voice input immediately before send in the right-side action group", () => {
    render(<ComposerHarness />);

    const voiceButton = screen.getByRole("button", { name: "Voice input" });
    const sendButton = screen.getByRole("button", { name: "Send" });

    expect(voiceButton.parentElement?.parentElement).toBe(sendButton.parentElement);
    expect(voiceButton.compareDocumentPosition(sendButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("replaces the text controls while listening and restores the baseline when cancelled", async () => {
    (window as typeof window & { webkitSpeechRecognition?: typeof FakeSpeechRecognition }).webkitSpeechRecognition = FakeSpeechRecognition;
    allowMicrophone();
    render(<ComposerHarness />);

    expect(screen.getByRole("textbox")).toHaveValue("Existing brief");
    fireEvent.click(screen.getByRole("button", { name: "Voice input" }));
    await waitFor(() => expect(FakeSpeechRecognition.instance?.start).toHaveBeenCalledOnce());

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Agent is listening");

    act(() => {
      FakeSpeechRecognition.instance?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "and a launch plan" } }]
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel voice input" }));

    expect(screen.getByRole("textbox")).toHaveValue("Existing brief");
    expect(screen.getByRole("button", { name: "Voice input" })).toBeInTheDocument();
  });

  it("keeps recognized text when the user stops to review", async () => {
    (window as typeof window & { webkitSpeechRecognition?: typeof FakeSpeechRecognition }).webkitSpeechRecognition = FakeSpeechRecognition;
    allowMicrophone();
    render(<ComposerHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Voice input" }));
    await waitFor(() => expect(FakeSpeechRecognition.instance?.start).toHaveBeenCalledOnce());

    act(() => {
      FakeSpeechRecognition.instance?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "and a launch plan" } }]
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Stop and review transcript" }));
    act(() => FakeSpeechRecognition.instance?.onend?.());

    expect(screen.getByRole("textbox")).toHaveValue("Existing brief and a launch plan");
  });
});
