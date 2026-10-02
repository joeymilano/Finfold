import { pageAutomationTask } from "./automation";
import { extractPageContext } from "./extract";
import { recommendPlatform } from "./recommendation";
import { STORE_BUILD } from "./flags";
import type { AutomationSendResult, ExtensionContextResponse, PageAutomationTask, Platform, ReplyContextResponse } from "./types";

const MENU_ROOT = "finfold-root";
const platforms: Array<{ id: Platform; title: string }> = [
  { id: "x", title: "Turn into an X post" },
  { id: "linkedin", title: "Turn into a LinkedIn post" },
  { id: "xiaohongshu", title: "转成小红书笔记" },
  { id: "reddit", title: "Turn into a Reddit post" }
];

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ROOT, title: "Create with Finfold", contexts: ["page", "selection"] });
    platforms.forEach(({ id, title }) => {
      chrome.contextMenus.create({ id: `finfold-${id}`, parentId: MENU_ROOT, title, contexts: ["page", "selection"] });
    });
  });
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  void chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  void chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const platform = String(info.menuItemId).replace("finfold-", "") as Platform;
  if (!platforms.some((item) => item.id === platform) || !tab?.id) return;
  void chrome.storage.session.set({
    finfoldPendingAction: {
      tabId: tab.id,
      platform,
      selectionText: info.selectionText?.slice(0, 8_000) ?? ""
    }
  });
  void chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  const type = (message as { type?: string }).type;
  if (type === "GET_PAGE_CONTEXT") {
    void resolveContext().then(sendResponse);
    return true;
  }
  if (!STORE_BUILD && type === "AUTOMATION") {
    void handleAutomation(message as AutomationMessage).then(sendResponse);
    return true;
  }
});

// Automation only ever runs on the reply-pilot platforms, and only in the
// tab the user opened the panel on (activeTab), never in the background.
// The X gate here is host-level only; the in-page task decides whether the
// URL is actually a tweet detail page.
const REPLY_PLATFORM_HOSTS = /^https?:\/\/([^/]+\.)?(xiaohongshu\.com|linkedin\.com|x\.com|twitter\.com)\//i;
type AutomationMessage =
  | { type: "AUTOMATION"; action: "capture" }
  | { type: "AUTOMATION"; action: "screenshot" }
  | { type: "AUTOMATION"; action: "send_dom"; platform: "xiaohongshu" | "linkedin" | "x"; commentText: string; replyText: string }
  | { type: "AUTOMATION"; action: "vision_send"; replyText: string; inputPoint: { x: number; y: number }; sendPoint?: { x: number; y: number } };

async function handleAutomation(message: AutomationMessage): Promise<ReplyContextResponse | AutomationSendResult | { ok: boolean; dataUrl?: string }> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = active?.id;
  if (!tabId) return { ok: false, code: "TAB_UNAVAILABLE" };
  // Without the "tabs" permission (or an activeTab grant on this tab) the URL
  // is unreadable. An empty URL must NOT be reported as NOT_REPLY_PLATFORM —
  // the injected task re-checks location.hostname inside the page, and a
  // missing grant surfaces as PERMISSION_DENIED, which tells the user to
  // click the toolbar icon instead of implying they are on the wrong site.
  const url = active.url ?? "";
  if (url && !REPLY_PLATFORM_HOSTS.test(url)) return { ok: false, code: "NOT_REPLY_PLATFORM" };
  try {
    if (message.action === "screenshot") {
      const dataUrl = await chrome.tabs.captureVisibleTab(active.windowId, { format: "jpeg", quality: 60 });
      return { ok: true, dataUrl };
    }
    const task: PageAutomationTask = message.action === "capture"
      ? { op: "capture" }
      : message.action === "send_dom"
        ? { op: "send", platform: message.platform, commentText: String(message.commentText ?? "").slice(0, 300), replyText: String(message.replyText ?? "").slice(0, 3_000) }
        : { op: "visionSend", replyText: String(message.replyText ?? "").slice(0, 3_000), inputPoint: message.inputPoint, sendPoint: message.sendPoint };
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: pageAutomationTask, args: [task] });
    return result ?? { ok: false, code: "UNKNOWN_ERROR" };
  } catch {
    // Most often activeTab was not granted (the user has not clicked the
    // toolbar icon on this tab) or the page navigated mid-task.
    return { ok: false, code: "PERMISSION_DENIED" };
  }
}

async function resolveContext(): Promise<ExtensionContextResponse> {
  const pending = (await chrome.storage.session.get("finfoldPendingAction")).finfoldPendingAction as
    | { tabId: number; platform?: Platform; selectionText?: string }
    | undefined;
  const [active] = pending?.tabId
    ? [await chrome.tabs.get(pending.tabId)]
    : await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = pending?.tabId ?? active?.id;
  const url = active?.url ?? "";
  await chrome.storage.session.remove("finfoldPendingAction");
  if (!tabId) {
    return { ok: false, code: "RESTRICTED_PAGE", message: "Chrome does not allow extensions to read this page. Open a regular webpage and try again." };
  }
  // Same trap as handleAutomation: tab.url is only visible once Chrome granted
  // access to this tab (host permission or activeTab; site access defaults to
  // "on click" since Chrome 137, so the grant is often missing). An empty URL
  // must NOT be reported as RESTRICTED_PAGE — executeScript below is the real
  // gate, and a missing grant surfaces as PERMISSION_DENIED with fix advice.
  if (url && isRestricted(url)) {
    return { ok: false, code: "RESTRICTED_PAGE", message: "Chrome does not allow extensions to read this page. Open a regular webpage and try again." };
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: extractPageContext });
    if (!result) return { ok: false, code: "NO_CONTENT", message: "No readable text was found. Select a passage, then open Finfold again." };
    if (pending?.selectionText && pending.selectionText.trim().length >= 20) {
      result.text = pending.selectionText.trim().slice(0, 8_000);
      result.selectionUsed = true;
    }
    return {
      ok: true,
      page: result,
      requestedPlatform: pending?.platform,
      recommendedPlatform: recommendPlatform(result)
    };
  } catch {
    return { ok: false, code: "PERMISSION_DENIED", message: "Finfold needs access to this tab. Click the Finfold icon in the toolbar once, then read the page again." };
  }
}

function isRestricted(url: string): boolean {
  return !/^https?:\/\//i.test(url) || /^https:\/\/chromewebstore\.google\.com\//i.test(url);
}
