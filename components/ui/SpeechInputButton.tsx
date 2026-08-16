"use client";

import { Mic, Square } from "@/components/ui/icons";
import { useCallback, useEffect, useRef, useState } from "react";
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
};

type SpeechInputButtonProps = {
  locale: Locale;
  onTranscript: (transcript: string) => void;
  disabled?: boolean;
  variant?: "light" | "dark";
  compact?: boolean;
  className?: string;
  buttonClassName?: string;
};

const copy = {
  zh: {
    start: "语音输入",
    stop: "停止录音",
    listening: "正在听…",
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
    listening: "Listening…",
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
  buttonClassName = ""
}: SpeechInputButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startListening = useCallback(() => {
    if (disabled) return;
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setMessage(copy[locale].unsupported);
      return;
    }

    setMessage(null);
    const recognition = new Recognition();
    recognition.lang = locale === "zh" ? "zh-CN" : "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
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
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      setMessage(copy[locale].failed);
    }
  }, [disabled, locale]);

  useEffect(() => {
    if (!disabled) return;
    recognitionRef.current?.abort();
  }, [disabled]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const buttonClass = variant === "dark"
    ? "border-brand/45 bg-white/[0.07] text-brand hover:bg-white/[0.12]"
    : "border-hairline bg-surface text-fg hover:bg-surface-2";
  const statusClass = variant === "dark" ? "text-white/50" : "text-fg-muted";

  return (
    <div className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={isListening ? stopListening : startListening}
        disabled={disabled}
        aria-pressed={isListening}
        aria-label={isListening ? copy[locale].stop : copy[locale].start}
        title={isListening ? copy[locale].stop : copy[locale].start}
        className={`focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass} ${compact ? "h-14 w-14 rounded-lg px-0 py-0" : ""} ${buttonClassName}`}
      >
        {isListening ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className={compact ? "h-5 w-5" : "h-3.5 w-3.5"} />}
        {!compact ? (isListening ? copy[locale].stop : copy[locale].start) : null}
      </button>
      {(isListening || message) ? (
        <span role="status" aria-live="polite" className={`min-w-0 break-words text-[11px] leading-4 ${isListening ? "text-brand" : statusClass}`}>
          {isListening ? copy[locale].listening : message}
        </span>
      ) : null}
    </div>
  );
}

export { appendTranscript };
