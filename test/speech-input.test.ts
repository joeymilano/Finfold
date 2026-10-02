import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceWaveformHistory, appendTranscript, calculateSpeechLevel } from "@/components/ui/SpeechInputButton";
import { SpeechInputButton } from "@/components/ui/SpeechInputButton";

class FakeSpeechRecognition {
  static instance: FakeSpeechRecognition | null = null;

  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult = null;
  onerror = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    FakeSpeechRecognition.instance = this;
  }
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

describe("speech input transcripts", () => {
  it("adds recognized speech without overwriting existing input", () => {
    expect(appendTranscript("Product launch", "is next Tuesday")).toBe("Product launch is next Tuesday");
  });

  it("keeps intentional whitespace and ignores empty recognition results", () => {
    expect(appendTranscript("已有内容\n", "继续补充")).toBe("已有内容\n继续补充");
    expect(appendTranscript("已有内容", "   ")).toBe("已有内容");
  });

  it("uses the approved thin outline microphone for the idle voice control", () => {
    render(React.createElement(SpeechInputButton, {
      locale: "en",
      compact: true,
      onTranscript: vi.fn()
    }));
    const button = screen.getByRole("button", { name: "Voice input" });
    const icon = button.querySelector('[data-fin-icon="Mic"]');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("data-fin-icon-provider", "lucide");
    expect(icon).toHaveClass("lucide-mic");
  });

  it("keeps silence flat and scales the level from real audio samples", () => {
    expect(calculateSpeechLevel(new Uint8Array(64).fill(128))).toBe(0);

    const speaking = Uint8Array.from({ length: 64 }, (_, index) => index % 2 === 0 ? 82 : 174);
    expect(calculateSpeechLevel(speaking)).toBeGreaterThan(0.8);
  });

  it("moves each audio sample from right to left before silence flattens the rail", () => {
    const history = [0, 0, 0, 0];

    expect(advanceWaveformHistory(history, 0.8)).toEqual([0, 0, 0, 0.8]);
    expect(advanceWaveformHistory(history, 0)).toEqual([0, 0, 0.8, 0]);
    expect(advanceWaveformHistory(history, 0)).toEqual([0, 0.8, 0, 0]);
    expect(advanceWaveformHistory(history, 0)).toEqual([0.8, 0, 0, 0]);
    expect(advanceWaveformHistory(history, 0)).toEqual([0, 0, 0, 0]);
  });

  it("turns the compact Agent control into a cancel, waveform, review, and send rail", async () => {
    (window as typeof window & { webkitSpeechRecognition?: typeof FakeSpeechRecognition }).webkitSpeechRecognition = FakeSpeechRecognition;
    allowMicrophone();

    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    const onListeningChange = vi.fn();
    render(React.createElement(SpeechInputButton, {
      locale: "zh",
      compact: true,
      onTranscript: vi.fn(),
      onCancel,
      onSubmit,
      onListeningChange
    }));
    fireEvent.click(screen.getByRole("button", { name: "语音输入" }));

    await waitFor(() => expect(FakeSpeechRecognition.instance?.start).toHaveBeenCalledOnce());
    expect(screen.getByRole("status")).toHaveTextContent("Finfold智能体正在听");
    expect(screen.getByRole("status").querySelectorAll(".speech-dictation-waveform > span")).toHaveLength(34);
    expect(screen.getByRole("button", { name: "取消语音输入" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止并检查文字" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止并发送" })).toBeInTheDocument();
    expect(onListeningChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "停止并检查文字" }));
    expect(FakeSpeechRecognition.instance?.stop).toHaveBeenCalledOnce();

    act(() => FakeSpeechRecognition.instance?.onend?.());
    expect(screen.getByRole("button", { name: "语音输入" })).toHaveAttribute("aria-pressed", "false");
    expect(onListeningChange).toHaveBeenLastCalledWith(false);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("aborts and discards the active dictation when cancel is selected", async () => {
    (window as typeof window & { webkitSpeechRecognition?: typeof FakeSpeechRecognition }).webkitSpeechRecognition = FakeSpeechRecognition;
    allowMicrophone();
    const onCancel = vi.fn();

    render(React.createElement(SpeechInputButton, { locale: "en", compact: true, onTranscript: vi.fn(), onCancel }));
    fireEvent.click(screen.getByRole("button", { name: "Voice input" }));
    await waitFor(() => expect(FakeSpeechRecognition.instance?.start).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Cancel voice input" }));

    expect(FakeSpeechRecognition.instance?.abort).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Voice input" })).toBeInTheDocument();
  });
});
