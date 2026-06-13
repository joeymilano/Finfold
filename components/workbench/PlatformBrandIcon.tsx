"use client";

import type { PlatformId } from "@/lib/platforms";

type PlatformBrandIconProps = {
  platform: PlatformId;
  selected?: boolean;
  className?: string;
};

const brandColor: Record<PlatformId, string> = {
  wechat: "#07C160",
  xiaohongshu: "#FF2442",
  moments: "#07C160",
  x: "#0F1419",
  linkedin: "#0A66C2",
  reddit: "#FF4500",
  "product-hunt": "#DA552F",
  threads: "#0F1419",
  "hacker-news": "#FF6600",
  "indie-hackers": "#0E2439",
  "medium-substack": "#FF6719"
};

export function PlatformBrandIcon({ platform, selected = false, className = "" }: PlatformBrandIconProps) {
  const color = selected ? "#ffffff" : brandColor[platform];
  const softColor = selected ? "rgba(255,255,255,0.18)" : `${brandColor[platform]}18`;

  if (platform === "wechat" || platform === "moments") {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true" className={className}>
        <rect width="40" height="40" rx="12" fill={softColor} />
        <path
          d="M17.6 13.3c-5 0-9 3.2-9 7.2 0 2.2 1.2 4.1 3.1 5.4l-.7 2.5 2.9-1.5c1.1.4 2.3.7 3.7.7 5 0 9-3.2 9-7.1s-4-7.2-9-7.2Z"
          fill={color}
        />
        <path
          d="M23.5 18.8c4.5 0 8 2.9 8 6.3 0 1.9-1.1 3.7-2.8 4.8l.6 2.1-2.5-1.3c-1 .4-2.1.6-3.3.6-4.5 0-8-2.8-8-6.2 0-3.5 3.5-6.3 8-6.3Z"
          fill={selected ? "rgba(255,255,255,0.68)" : "#9EEA72"}
        />
        <circle cx="15" cy="19.5" r="1.2" fill={selected ? "#0f1419" : "#ffffff"} />
        <circle cx="20.5" cy="19.5" r="1.2" fill={selected ? "#0f1419" : "#ffffff"} />
      </svg>
    );
  }

  if (platform === "x") {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true" className={className}>
        <rect width="40" height="40" rx="12" fill={softColor} />
        <path
          d="M23.4 18.3 32.1 8h-2.7l-7.2 8.5L16.5 8H8l9.2 13.4L8 32h2.7l7.8-9.1 6.1 9.1H33l-9.6-13.7Zm-3.5 2.4-1.2-1.7-6.2-8.9h2.8l5.1 7.3 1.1 1.7 6.6 9.5h-2.8l-5.4-7.9Z"
          fill={color}
        />
      </svg>
    );
  }

  if (platform === "reddit") {
    return (
      <svg viewBox="0 0 40 40" aria-hidden="true" className={className}>
        <rect width="40" height="40" rx="12" fill={softColor} />
        <path d="M28.3 17.6c1.5.2 2.7 1.4 2.7 2.9 0 1-.5 1.9-1.3 2.4.1.4.1.8.1 1.2 0 4.1-4.4 7.4-9.8 7.4s-9.8-3.3-9.8-7.4c0-.4 0-.8.1-1.2-.8-.5-1.3-1.4-1.3-2.4 0-1.6 1.2-2.8 2.7-2.9.8-3 3.8-5.2 7.5-5.5l1.4-5.5 5.2 1.1c.4-.7 1.1-1.2 2-1.2 1.3 0 2.3 1 2.3 2.3s-1 2.3-2.3 2.3c-1.1 0-2-.8-2.2-1.8l-3.7-.8-1 3.6c3.6.3 6.6 2.5 7.4 5.5Z" fill={color} />
        <circle cx="16.2" cy="23.2" r="1.8" fill={selected ? "#0f1419" : "#fff"} />
        <circle cx="23.8" cy="23.2" r="1.8" fill={selected ? "#0f1419" : "#fff"} />
        <path d="M16.2 27.2c1.9 1.3 5.6 1.3 7.6 0" fill="none" stroke={selected ? "#0f1419" : "#fff"} strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  const textLabel: Record<PlatformId, string> = {
    wechat: "",
    xiaohongshu: "RED",
    moments: "",
    x: "",
    linkedin: "in",
    reddit: "",
    "product-hunt": "P",
    threads: "@",
    "hacker-news": "Y",
    "indie-hackers": "IH",
    "medium-substack": "S"
  };

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-xl font-semibold ${className}`}
      style={{ backgroundColor: softColor, color }}
    >
      {textLabel[platform]}
    </span>
  );
}
