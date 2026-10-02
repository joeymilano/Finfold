export type Platform = "x" | "linkedin" | "xiaohongshu" | "reddit";
export type Language = "auto" | "zh" | "en";

export type PageContext = {
  url: string;
  title: string;
  siteName: string;
  description: string;
  language: string;
  text: string;
  selectionUsed: boolean;
};

export type GeneratedResult = {
  platform: Platform;
  title: string;
  body: string;
  summary?: string;
  cta: string;
  notes: string;
  strategy: string;
};

export type ExtensionContextResponse =
  | { ok: true; page: PageContext; requestedPlatform?: Platform; recommendedPlatform: Platform }
  | { ok: false; code: "RESTRICTED_PAGE" | "NO_CONTENT" | "PERMISSION_DENIED"; message: string };

export type ReplyPlatform = "xiaohongshu" | "linkedin" | "x";
export type CapturedComment = { text: string; author: string };

export type ReplyContextResponse =
  | { ok: true; platform: ReplyPlatform; postText: string; selection: string; comments: CapturedComment[] }
  | { ok: false; code: "NOT_REPLY_PLATFORM" | "TAB_UNAVAILABLE" | "PERMISSION_DENIED" | "UNKNOWN_ERROR" };

export type AutomationSendResult =
  | { status: "sent" }
  | { status: "typed" }
  | { status: "needs_vision" }
  | { status: "failed"; code: string };

export type PageAutomationTask =
  | { op: "capture" }
  | { op: "send"; platform: ReplyPlatform; commentText: string; replyText: string }
  | { op: "visionSend"; replyText: string; inputPoint: { x: number; y: number }; sendPoint?: { x: number; y: number } };

export type PageAutomationResult = ReplyContextResponse | AutomationSendResult;

export type VisionLocateResponse = {
  replyInput: { x: number; y: number } | null;
  sendButton: { x: number; y: number } | null;
};
