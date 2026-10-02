"use client";

import { ArrowUp, Mic, Square, X } from "@/components/ui/icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";

type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};
type SpeechRecognitionErrorEventLike = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  webkitAudioContext?: typeof AudioContext;
};

type SpeechInputButtonProps = {
  locale: Locale;
  onTranscript: (transcript: string) => void;
  disabled?: boolean;
  variant?: "light" | "dark";
  compact?: boolean;
  className?: string;
  buttonClassName?: string;
  onListeningChange?: (isListening: boolean) => void;
  onCancel?: () => void;
  onSubmit?: () => void;
  confirmDisabled?: boolean;
};

const copy = {
  zh: {
    start: "语音输入",
    stop: "停止录音",
    cancel: "取消语音输入",
    review: "停止并检查文字",
    send: "停止并发送",
    listening: "正在听…",
    agentListening: "Finfold智能体正在听",
    unsupported: "当前浏览器不支持语音输入，请使用 Chrome 或 Edge。",
    permission: "麦克风权限未开启，请在浏览器设置中允许后重试。",
    unavailable: "未找到可用麦克风，请检查设备后重试。",
    network: "语音识别服务暂时不可用，请重试。",
    noSpeech: "没有识别到语音，请再试一次。",
    failed: "语音识别失败，请重试。"
  },
  en: {
    start: "Voice input",
    stop: "Stop recording",
    cancel: "Cancel voice input",
    review: "Stop and review transcript",
    send: "Stop and send",
    listening: "Listening…",
    agentListening: "Agent is listening",
    unsupported: "Voice input is not supported in this browser. Try Chrome or Edge.",
    permission: "Microphone access is off. Allow it in your browser settings and try again.",
    unavailable: "No microphone is available. Check your device and try again.",
    network: "Speech recognition is temporarily unavailable. Please try again.",
    noSpeech: "No speech was detected. Please try again.",
    failed: "Speech recognition failed. Please try again."
  }
} as const;

function getRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function appendTranscript(current: string, transcript: string): string {
  const next = transcript.trim();
  if (!next) return current;
  if (!current.trim()) return next;
  if (/[\s\n]$/.test(current)) return `${current}${next}`;
  return `${current.trimEnd()} ${next}`;
}

function calculateSpeechLevel(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let energy = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    energy += centered * centered;
  }
  const rms = Math.sqrt(energy / samples.length);
  const noiseFloor = 0.022;
  if (rms <= noiseFloor) return 0;
  return Math.min(1, (rms - noiseFloor) / 0.18);
}

function advanceWaveformHistory(history: number[], level: number): number[] {
  if (history.length === 0) return history;
  history.shift();
  history.push(Math.min(1, Math.max(0, level)));
  return history;
}

function ListeningWaveform() {
  return (
    <span className="speech-listening-waveform" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
    </span>
  );
}

const WIDE_WAVEFORM_BAR_COUNT = 34;

function WideListeningWaveform({ waveformRef }: { waveformRef: React.RefObject<HTMLSpanElement | null> }) {
  return (
    <span ref={waveformRef} className="speech-dictation-waveform" aria-hidden="true">
      {Array.from({ length: WIDE_WAVEFORM_BAR_COUNT }, (_, index) => <span key={index} />)}
    </span>
  );
}

/**
 * Browser-native speech recognition. Audio is requested only after an explicit
 * click and the browser handles the microphone permission prompt. The selected
 * app locale controls the recognition locale (Chinese or English).
 */
export function SpeechInputButton({
  locale,
  onTranscript,
  disabled = false,
  variant = "light",
  compact = false,
  className = "",
  buttonClassName = "",
  onListeningChange,
  onCancel,
  onSubmit,
  confirmDisabled = false
}: SpeechInputButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const completionActionRef = useRef<"review" | "submit" | null>(null);
  const waveformRef = useRef<HTMLSpanElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioHistoryRef = useRef<number[]>(Array(WIDE_WAVEFORM_BAR_COUNT).fill(0));
  const startAttemptRef = useRef(0);
  const onTranscriptRef = useRef(onTranscript);
  const onListeningChangeRef = useRef(onListeningChange);
  const onCancelRef = useRef(onCancel);
  const onSubmitRef = useRef(onSubmit);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onListeningChangeRef.current = onListeningChange;
    onCancelRef.current = onCancel;
    onSubmitRef.current = onSubmit;
  }, [onCancel, onListeningChange, onSubmit, onTranscript]);

  const resetWaveform = useCallback(() => {
    audioHistoryRef.current.fill(0);
    waveformRef.current?.querySelectorAll<HTMLElement>("span").forEach((bar) => {
      bar.style.height = "3px";
    });
  }, []);

  const cleanupAudio = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    audioSourceRef.current?.disconnect();
    audioSourceRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
    resetWaveform();
  }, [resetWaveform]);

  const startAudioMeter = useCallback((stream: MediaStream) => {
    const AudioContextConstructor = window.AudioContext ?? (window as SpeechWindow).webkitAudioContext;
    if (!AudioContextConstructor) return;

    const audioContext = new AudioContextConstructor();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);
    audioContextRef.current = audioContext;
    audioSourceRef.current = source;
    void audioContext.resume().catch(() => undefined);

    const samples = new Uint8Array(analyser.fftSize);
    let previousSampleAt = 0;
    const sampleAudio = (timestamp: number) => {
      if (timestamp - previousSampleAt >= 42) {
        previousSampleAt = timestamp;
        analyser.getByteTimeDomainData(samples);
        const level = calculateSpeechLevel(samples);
        const history = advanceWaveformHistory(audioHistoryRef.current, level);
        waveformRef.current?.querySelectorAll<HTMLElement>("span").forEach((bar, index) => {
          bar.style.height = `${3 + (history[index] ?? 0) * 25}px`;
        });
      }
      animationFrameRef.current = requestAnimationFrame(sampleAudio);
    };
    animationFrameRef.current = requestAnimationFrame(sampleAudio);
  }, []);

  const finishListening = useCallback((action: "review" | "submit" | null) => {
    startAttemptRef.current += 1;
    cleanupAudio();
    recognitionRef.current = null;
    completionActionRef.current = null;
    setIsListening(false);
    onListeningChangeRef.current?.(false);
    if (action === "submit") {
      requestAnimationFrame(() => onSubmitRef.current?.());
    }
  }, [cleanupAudio]);

  const stopListening = useCallback((action: "review" | "submit" = "review") => {
    const recognition = recognitionRef.current;
    completionActionRef.current = action;
    if (!recognition) {
      finishListening(action);
      return;
    }
    try {
      recognition.stop();
    } catch {
      finishListening(action);
    }
  }, [finishListening]);

  const cancelListening = useCallback(() => {
    startAttemptRef.current += 1;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    completionActionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.abort();
    }
    cleanupAudio();
    setIsListening(false);
    onCancelRef.current?.();
    onListeningChangeRef.current?.(false);
  }, [cleanupAudio]);

  const startListening = useCallback(async () => {
    if (disabled) return;
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setMessage(copy[locale].unsupported);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage(copy[locale].unavailable);
      return;
    }

    setMessage(null);
    const startAttempt = startAttemptRef.current + 1;
    startAttemptRef.current = startAttempt;
    setIsListening(true);
    onListeningChangeRef.current?.(true);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (startAttemptRef.current !== startAttempt) return;
      const errorName = error instanceof DOMException ? error.name : "";
      setMessage(errorName === "NotAllowedError" || errorName === "SecurityError"
        ? copy[locale].permission
        : copy[locale].unavailable);
      setIsListening(false);
      onListeningChangeRef.current?.(false);
      return;
    }
    if (startAttemptRef.current !== startAttempt) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    mediaStreamRef.current = stream;
    startAudioMeter(stream);

    const recognition = new Recognition();
    recognition.lang = locale === "zh" ? "zh-CN" : "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal) onTranscriptRef.current(result[0]?.transcript ?? "");
      }
    };
    recognition.onerror = (event) => {
      const errorMessage = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? copy[locale].permission
        : event.error === "audio-capture"
          ? copy[locale].unavailable
          : event.error === "network"
            ? copy[locale].network
            : event.error === "no-speech"
              ? copy[locale].noSpeech
              : copy[locale].failed;
      setMessage(errorMessage);
    };
    recognition.onend = () => {
      finishListening(completionActionRef.current);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      cleanupAudio();
      recognitionRef.current = null;
      setIsListening(false);
      onListeningChangeRef.current?.(false);
      setMessage(copy[locale].failed);
    }
  }, [cleanupAudio, disabled, finishListening, locale, startAudioMeter]);

  useEffect(() => {
    if (!disabled) return;
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onend = null;
    recognition.abort();
    finishListening(null);
  }, [disabled, finishListening]);

  useEffect(() => () => {
    startAttemptRef.current += 1;
    recognitionRef.current?.abort();
    cleanupAudio();
  }, [cleanupAudio]);

  const buttonClass = isListening
    ? variant === "dark"
      ? "border-action/35 bg-action/10 text-action hover:bg-action/15"
      : "border-action/30 bg-action/[0.08] text-action-strong hover:bg-action/[0.12]"
    : variant === "dark"
      ? "border-brand/45 bg-white/[0.07] text-brand hover:bg-white/[0.12]"
      : "border-hairline bg-surface text-fg hover:bg-surface-2";
  const statusClass = variant === "dark" ? "text-white/50" : "text-fg-muted";
  const listeningStatusClass = variant === "dark" ? "text-action" : "text-action-strong";

  if (compact && isListening) {
    return (
      <div
        data-listening="true"
        className={`speech-dictation-rail speech-listening-shell flex min-w-0 flex-1 items-center gap-2 ${className}`}
      >
        <button
          type="button"
          onClick={cancelListening}
          aria-label={copy[locale].cancel}
          title={copy[locale].cancel}
          className="focus-ring speech-dictation-control grid h-10 w-10 shrink-0 place-items-center rounded-full border border-hairline text-fg-muted transition hover:border-fg-subtle hover:bg-surface-2 hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>

        <span role="status" aria-live="polite" className="speech-dictation-track min-w-0 flex-1">
          <span className="sr-only">{copy[locale].agentListening}</span>
          <WideListeningWaveform waveformRef={waveformRef} />
        </span>

        <button
          type="button"
          onClick={() => stopListening("review")}
          aria-label={copy[locale].review}
          title={copy[locale].review}
          className="focus-ring speech-dictation-control grid h-10 w-10 shrink-0 place-items-center rounded-full border border-hairline text-fg transition hover:border-action/35 hover:bg-surface-2"
        >
          <Square className="h-2.5 w-2.5 fill-current" />
        </button>

        <button
          type="button"
          onClick={() => stopListening("submit")}
          disabled={confirmDisabled}
          aria-label={copy[locale].send}
          title={copy[locale].send}
          className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-full bg-action text-on-action shadow-[0_6px_18px_rgb(var(--action)/0.24)] transition hover:bg-action-strong disabled:cursor-not-allowed disabled:bg-fg disabled:text-bg disabled:opacity-25 disabled:shadow-none"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      data-listening={isListening ? "true" : "false"}
      className={`inline-flex min-w-0 items-center gap-1.5 ${compact && isListening ? "speech-listening-shell rounded-full border border-action/25 bg-action/[0.08] pr-3 shadow-[0_8px_24px_-16px_rgb(var(--action)/0.72)]" : ""} ${className}`}
    >
      <button
        type="button"
        onClick={isListening ? () => stopListening("review") : () => void startListening()}
        disabled={disabled}
        aria-pressed={isListening}
        aria-label={isListening ? copy[locale].stop : copy[locale].start}
        title={isListening ? copy[locale].stop : copy[locale].start}
        className={`focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass} ${compact ? "order-2 h-14 w-14 rounded-lg px-0 py-0" : ""} ${buttonClassName}`}
      >
        {isListening ? (
          <span className="speech-listening-stop relative grid h-5 w-5 place-items-center" aria-hidden="true">
            <span className="speech-listening-ring absolute inset-0 rounded-full border border-current/45" />
            <Square className="relative h-2.5 w-2.5 fill-current" />
          </span>
        ) : <Mic strokeWidth={2} className={compact ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} />}
        {!compact ? (isListening ? copy[locale].stop : copy[locale].start) : null}
      </button>
      {(isListening || message) ? (
        <span role="status" aria-live="polite" className={`min-w-0 break-words text-[11px] leading-4 ${compact ? "order-1" : ""} ${isListening ? listeningStatusClass : statusClass}`}>
          {isListening ? (
            <span className="inline-flex items-center gap-2 whitespace-nowrap font-semibold">
              {compact ? copy[locale].agentListening : copy[locale].listening}
              <ListeningWaveform />
            </span>
          ) : message}
        </span>
      ) : null}
    </div>
  );
}

export { advanceWaveformHistory, appendTranscript, calculateSpeechLevel };
