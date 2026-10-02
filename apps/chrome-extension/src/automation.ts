import type { PageAutomationResult, PageAutomationTask } from "./types";

/**
 * Runs INSIDE the active tab through chrome.scripting.executeScript.
 *
 * The whole function tree must stay self-contained: executeScript serializes
 * `func` with Function.prototype.toString, so a reference to any module-scope
 * binding would be `undefined` in the page. Type-only imports are safe because
 * they are erased at build time. The optional `env` parameter exists for unit
 * tests, which cannot rewrite jsdom's location; production callers omit it.
 */
export async function pageAutomationTask(
  task: PageAutomationTask,
  env?: { host?: string; path?: string }
): Promise<PageAutomationResult> {
  const normalize = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const host = (env?.host ?? location.hostname).toLowerCase();
  // X only qualifies on a tweet detail page: everywhere else on x.com the
  // same article elements are timeline posts, not replies to one post.
  const xStatusPage = /^\/[^/]+\/status\/\d+/.test(env?.path ?? location.pathname)
    || /^\/i\/web\/status\/\d+/.test(env?.path ?? location.pathname);
  const platform = host.endsWith("xiaohongshu.com")
    ? ("xiaohongshu" as const)
    : host.endsWith("linkedin.com")
      ? ("linkedin" as const)
      : (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) && xStatusPage
        ? ("x" as const)
        : null;

  // jsdom has no layout, so a zero rect is treated as "not hidden" instead of
  // "invisible"; real browsers still filter via display/visibility checks.
  const visible = (element: Element) => {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    const rect = element.getBoundingClientRect();
    return rect.width === 0 && rect.height === 0 ? true : rect.width > 0 && rect.height > 0;
  };
  const buttonLabel = (element: Element) =>
    normalize(`${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("title") ?? ""}`);
  const commentItemSelectors = platform === "xiaohongshu"
    ? [".comment-item", "[class*='comment-item']"]
    : platform === "x"
      ? ["article[data-testid='tweet']"]
      : [".comments-comment-item", "[data-id^='urn:li:comment']", "[class*='comment-item']"];
  const collectCommentItems = () => {
    const found: Element[] = [];
    for (const selector of commentItemSelectors) {
      try {
        document.querySelectorAll(selector).forEach((element) => { if (!found.includes(element)) found.push(element); });
      } catch { /* a selector this page build does not accept */ }
    }
    // On an X detail page the first article is the main tweet itself, not a
    // reply; drop it so capture and block matching only see actual replies.
    if (platform === "x" && found.length > 0) found.shift();
    return found.filter(visible);
  };
  const commentTextOf = (item: Element) => {
    if (platform === "x") {
      const text = Array.from(item.querySelectorAll("[data-testid='tweetText']"))
        .map((holder) => normalize(holder.textContent ?? ""))
        .filter((part) => part.length >= 2)
        .join(" ");
      return text.slice(0, 300);
    }
    for (const holder of Array.from(item.querySelectorAll("[class*='comment-text'], .note-text, [class*='content']"))) {
      const text = normalize(holder.textContent ?? "");
      if (text.length >= 2) return text.slice(0, 300);
    }
    return normalize(item.textContent ?? "").slice(0, 300);
  };
  const commentAuthorOf = (item: Element) => {
    const raw = platform === "x"
      ? normalize(item.querySelector("[data-testid='User-Name']")?.textContent ?? "")
      : normalize(item.querySelector("[class*='author'], [class*='name'], [class*='actor']")?.textContent ?? "");
    if (platform !== "x") return raw.slice(0, 60);
    const handle = /@[\w.]+/.exec(raw)?.[0];
    return (handle ?? raw).slice(0, 60);
  };

  const isEditable = (element: Element | null): element is HTMLElement =>
    element !== null
    && (element.tagName === "TEXTAREA"
      || (element.tagName === "INPUT" && (element as HTMLInputElement).type !== "hidden")
      || (element as HTMLElement).isContentEditable === true
      || element.getAttribute("contenteditable") === "true");
  const editableQuery = "textarea, input[type='text'], [contenteditable='true']";

  // React-controlled inputs only commit changes set through the native value
  // setter; contenteditable editors (LinkedIn Draft.js) accept synthetic
  // insertText. Both paths are verified by reading the element back.
  const typeInto = (element: HTMLElement, text: string) => {
    element.focus();
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, text);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return element.value === text;
    }
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    try {
      if (typeof document.execCommand === "function") document.execCommand("insertText", false, text);
    } catch { /* some editors reject synthetic insertText; the fallback below still sets the text */ }
    if (!normalize(element.textContent ?? "").includes(normalize(text).slice(0, 20))) {
      element.textContent = text;
      element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    }
    return normalize(element.textContent ?? "").includes(normalize(text).slice(0, 20));
  };

  // Climb from the reply input to the nearest submit control. Climbing stops
  // as soon as a scope would contain OTHER comment items — that means the
  // search left this comment's editor and the next "回复/Reply" button would
  // belong to a different comment.
  const findSendButton = (input: HTMLElement, skip: Element[], commentItems: Element[]) => {
    const sendLabel = /^(发送|發送|send|回复|回覆|reply|post|comment|提交)(\s*\(.*\))?$/i;
    const usable = (element: Element) => visible(element)
      && !skip.includes(element)
      && !(element as HTMLButtonElement).disabled
      && element.getAttribute("aria-disabled") !== "true"
      && !element.contains(input)
      && !input.contains(element);
    let levels = 0;
    for (let scope: HTMLElement | null = input.parentElement; scope && scope !== document.body && levels < 8; scope = scope.parentElement, levels++) {
      if (commentItems.some((item) => scope.contains(item) && !item.contains(input))) return null;
      const buttons = Array.from(scope.querySelectorAll("button, [role='button']")).filter(usable);
      // X names its composers' submit controls by testid, which survives
      // localization ("Reply"/"Post"/"回复"/"发帖") and label-count suffixes.
      const byTestId = buttons.find((element) => element.matches("button[data-testid='tweetButton'], button[data-testid='tweetButtonInline']"));
      if (byTestId) return byTestId;
      const byLabel = buttons.find((element) => sendLabel.test(buttonLabel(element)));
      if (byLabel) return byLabel;
      const submit = buttons.find((element) => element.getAttribute("type") === "submit");
      if (submit) return submit;
    }
    return null;
  };

  const capture = (): PageAutomationResult => {
    if (!platform) return { ok: false, code: "NOT_REPLY_PLATFORM" };
    const postSelectors = platform === "xiaohongshu"
      ? ["#detail-desc", ".note-text", "[class*='desc']"]
      : platform === "x"
        ? ["article[data-testid='tweet'] [data-testid='tweetText']"]
        : [".feed-shared-text", "[class*='update-text']", "[class*='comment-entity']"];
    let postText = "";
    for (const selector of postSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element) postText = normalize(element.textContent ?? "").slice(0, 4_000);
      } catch { /* skip unsupported selector */ }
      if (postText.length >= 10) break;
    }
    if (postText.length < 10) {
      postText = normalize(document.querySelector("meta[property='og:description']")?.getAttribute("content") ?? "").slice(0, 1_000);
    }
    const selection = normalize(String(window.getSelection?.() ?? "")).slice(0, 300);
    const comments: Array<{ text: string; author: string }> = [];
    for (const item of collectCommentItems()) {
      const text = commentTextOf(item);
      if (text.length < 2) continue;
      if (comments.some((existing) => existing.text === text || (existing.text.length <= text.length && text.includes(existing.text)))) continue;
      for (let index = comments.length - 1; index >= 0; index--) {
        if (text.length <= comments[index].text.length && comments[index].text.includes(text)) comments.splice(index, 1);
      }
      comments.push({
        text,
        author: commentAuthorOf(item)
      });
      if (comments.length >= 12) break;
    }
    return { ok: true, platform, postText, selection, comments };
  };

  const send = async (commentText: string, replyText: string): Promise<PageAutomationResult> => {
    if (!platform) return { status: "needs_vision" };
    const want = normalize(commentText).slice(0, 300);
    const matchKey = want.slice(0, Math.min(60, want.length));
    if (matchKey.length < 2) return { status: "needs_vision" };
    const commentItems = collectCommentItems();
    let block: Element | undefined = commentItems.find((item) => commentTextOf(item).includes(matchKey));
    if (!block) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (normalize(node.nodeValue ?? "").includes(matchKey)) {
          let candidate: HTMLElement | null = node.parentElement;
          for (let hop = 0; hop < 6 && candidate && candidate !== document.body; hop++) {
            if (normalize(candidate.textContent ?? "").length <= want.length + 400) break;
            candidate = candidate.parentElement;
          }
          block = candidate ?? node.parentElement ?? undefined;
          break;
        }
      }
    }
    if (!block) return { status: "needs_vision" };
    const editablesBefore = new Set(Array.from(document.querySelectorAll(editableQuery)).filter(visible));
    const clickedTriggers: Element[] = [];
    for (const trigger of Array.from(block.querySelectorAll("a, button, [role='button']"))) {
      if (!visible(trigger)) continue;
      if (/^(回复|回覆|reply)(\s*\(.*\))?$/i.test(buttonLabel(trigger)) || trigger.matches("button[data-testid='reply']")) {
        (trigger as HTMLElement).click();
        clickedTriggers.push(trigger);
        break;
      }
    }
    const candidates = (): HTMLElement[] => Array.from(document.querySelectorAll(editableQuery))
      .filter((element): element is HTMLElement => visible(element) && isEditable(element));
    let input: HTMLElement | null = null;
    for (let waited = 0; waited < 4_000 && !input; waited += 150) {
      const current = candidates();
      input = current.find((element) => !editablesBefore.has(element))
        ?? current.find((element) => block.contains(element) || Boolean(block.parentElement?.contains(element)))
        ?? (clickedTriggers.length === 0 && current.length === 1 ? current[0] : null);
      if (!input) await sleep(150);
    }
    if (!input) return { status: "needs_vision" };
    if (!typeInto(input, replyText.slice(0, 3_000))) return { status: "failed", code: "TYPE_FAILED" };
    let sendButton = findSendButton(input, clickedTriggers, commentItems);
    if (!sendButton) {
      // X enables the submit button only after React re-renders with content;
      // one short retry covers that tick without slowing the happy path.
      await sleep(400);
      sendButton = findSendButton(input, clickedTriggers, commentItems);
    }
    if (!sendButton) return { status: "typed" };
    (sendButton as HTMLElement).click();
    return { status: "sent" };
  };

  // inputPoint/sendPoint arrive normalized to the screenshot (0..1). They are
  // converted against THIS tab's viewport — the side panel's own
  // window.innerWidth is the panel width, not the page width.
  const visionSend = async (
    replyText: string,
    inputPoint: { x: number; y: number },
    sendPoint?: { x: number; y: number }
  ): Promise<PageAutomationResult> => {
    const clampX = (value: number) => Math.max(0, Math.min(window.innerWidth - 1, Math.round(value * window.innerWidth)));
    const clampY = (value: number) => Math.max(0, Math.min(window.innerHeight - 1, Math.round(value * window.innerHeight)));
    const x = clampX(inputPoint.x);
    const y = clampY(inputPoint.y);
    const pickEditableAt = () => {
      const hit = document.elementFromPoint(x, y);
      if (!hit) return null;
      if (isEditable(hit)) return hit;
      const inside = hit.querySelector?.(editableQuery);
      if (inside && isEditable(inside)) return inside as HTMLElement;
      let climb: Element | null = hit;
      while (climb) {
        if (climb !== hit && isEditable(climb)) return climb as HTMLElement;
        climb = climb.parentElement;
      }
      return null;
    };
    let input = pickEditableAt();
    if (!input) {
      // The model may point at the collapsed comment control; clicking it
      // opens the inline editor, which is then picked up by the poll below.
      const hit = document.elementFromPoint(x, y) as HTMLElement | null;
      hit?.click();
      for (let waited = 0; waited < 2_000 && !input; waited += 150) {
        input = pickEditableAt();
        if (!input) await sleep(150);
      }
    }
    if (!input) return { status: "failed", code: "NO_EDITABLE_AT_POINT" };
    if (!typeInto(input, replyText.slice(0, 3_000))) return { status: "failed", code: "TYPE_FAILED" };
    let sendButton: Element | null = null;
    if (sendPoint) {
      const hit = document.elementFromPoint(clampX(sendPoint.x), clampY(sendPoint.y));
      const button = hit ? (hit.matches("button, [role='button']") ? hit : hit.closest("button, [role='button']")) : null;
      // A disabled button swallows clicks silently; never claim "sent" for one.
      if (button && !(button as HTMLButtonElement).disabled && button.getAttribute("aria-disabled") !== "true") sendButton = button;
    }    if (!sendButton) sendButton = findSendButton(input, [], collectCommentItems());
    if (!sendButton) return { status: "typed" };
    (sendButton as HTMLElement).click();
    return { status: "sent" };
  };

  if (task.op === "capture") return capture();
  if (task.op === "send") return send(task.commentText, task.replyText);
  return visionSend(task.replyText, task.inputPoint, task.sendPoint);
}
