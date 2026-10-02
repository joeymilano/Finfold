// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { pageAutomationTask } from "./automation";
import type { ReplyContextResponse } from "./types";

beforeEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

it("captures comments and post text from a Xiaohongshu page", async () => {
  document.body.innerHTML = `
    <div id="detail-desc">这是原帖正文，介绍一个新产品的发布时间和价格。</div>
    <div class="comment-list">
      <div class="comment-item"><div class="author">小明</div><div class="content">请问多少钱？</div></div>
      <div class="comment-item"><div class="author">小红</div><div class="content">已支持邮箱登录了吗？</div></div>
    </div>`;
  const result = (await pageAutomationTask({ op: "capture" }, { host: "www.xiaohongshu.com" })) as ReplyContextResponse;
  if (!result.ok) throw new Error("capture should succeed");
  expect(result.platform).toBe("xiaohongshu");
  expect(result.postText).toContain("原帖正文");
  expect(result.comments).toEqual([
    { text: "请问多少钱？", author: "小明" },
    { text: "已支持邮箱登录了吗？", author: "小红" }
  ]);
});

it("refuses to automate pages outside the two reply platforms", async () => {
  document.body.innerHTML = `<div class="comment-item"><div class="content">hello</div></div>`;
  const result = await pageAutomationTask({ op: "capture" }, { host: "example.com" });
  expect(result).toEqual({ ok: false, code: "NOT_REPLY_PLATFORM" });
});

it("captures replies on an X detail page but not the main tweet", async () => {
  document.body.innerHTML = `
    <div class="timeline">
      <article data-testid="tweet">
        <div data-testid="User-Name">Ada @ada · 1h</div>
        <div data-testid="tweetText">Launch day! Finfold is out now.</div>
        <button data-testid="reply">Reply</button>
      </article>
      <article data-testid="tweet">
        <div data-testid="User-Name">Bob @bob · 2h</div>
        <div data-testid="tweetText">How much is the pro plan?</div>
        <button data-testid="reply">Reply</button>
      </article>
      <article data-testid="tweet">
        <div data-testid="User-Name">Cara @cara · 3h</div>
        <div data-testid="tweetText">Does it work on Windows?</div>
        <button data-testid="reply">Reply</button>
      </article>
    </div>`;
  const result = (await pageAutomationTask({ op: "capture" }, { host: "x.com", path: "/ada/status/1234567890" })) as ReplyContextResponse;
  if (!result.ok) throw new Error("capture should succeed");
  expect(result.platform).toBe("x");
  expect(result.postText).toContain("Launch day!");
  expect(result.comments).toEqual([
    { text: "How much is the pro plan?", author: "@bob" },
    { text: "Does it work on Windows?", author: "@cara" }
  ]);
});

it("refuses X pages outside a tweet detail page", async () => {
  document.body.innerHTML = `<article data-testid="tweet"><div data-testid="tweetText">timeline post</div></article>`;
  const result = await pageAutomationTask({ op: "capture" }, { host: "x.com", path: "/home" });
  expect(result).toEqual({ ok: false, code: "NOT_REPLY_PLATFORM" });
});

function xReplyFixture({ delayedEnable = false }: { delayedEnable?: boolean } = {}) {
  // Mirrors X's DOM: the reply's own composer is a modal dialog outside the
  // article, its editor is contenteditable, and the submit button only turns
  // usable after React re-renders with content.
  document.body.innerHTML = `
    <div class="timeline">
      <article data-testid="tweet">
        <div data-testid="User-Name">Ada @ada · 1h</div>
        <div data-testid="tweetText">Launch day! Finfold is out now.</div>
        <button data-testid="reply">Reply</button>
      </article>
      <article data-testid="tweet">
        <div data-testid="User-Name">Bob @bob · 2h</div>
        <div data-testid="tweetText">How much is the pro plan?</div>
        <button data-testid="reply">Reply</button>
      </article>
    </div>
    <div class="inline-composer"><div data-testid="tweetTextarea_0" contenteditable="true"></div></div>
    <div class="modal" role="dialog">
      <div data-testid="tweetTextarea_0" contenteditable="true" style="display:none"></div>
      <button data-testid="tweetButton" disabled style="display:none">Reply</button>
    </div>`;
  const article = document.querySelectorAll("article")[1];
  const editor = document.querySelector(".modal [data-testid='tweetTextarea_0']") as HTMLElement;
  const send = document.querySelector(".modal [data-testid='tweetButton']") as HTMLButtonElement;
  let sent = 0;
  // jsdom does not inherit display:none into computed styles, so the editor
  // and button hide themselves directly instead of via the modal container.
  article.querySelector("button")!.addEventListener("click", () => {
    editor.style.display = "block";
    send.style.display = "block";
  });
  send.addEventListener("click", () => { sent += 1; });
  editor.addEventListener("input", () => {
    if (delayedEnable) window.setTimeout(() => { send.disabled = false; }, 150);
    else send.disabled = false;
  });
  return { editor, send, sent: () => sent };
}

it("replies on X by clicking the reply trigger, typing into the modal and sending", async () => {
  const fixture = xReplyFixture();
  const result = await pageAutomationTask(
    { op: "send", platform: "x", commentText: "How much is the pro plan?", replyText: "$9/mo, link in bio." },
    { host: "x.com", path: "/ada/status/1234567890" }
  );
  expect(result).toEqual({ status: "sent" });
  expect(fixture.editor.textContent).toContain("$9/mo");
  expect(fixture.sent()).toBe(1);
});

it("waits one tick for X to enable the submit button after typing", async () => {
  const fixture = xReplyFixture({ delayedEnable: true });
  const result = await pageAutomationTask(
    { op: "send", platform: "x", commentText: "How much is the pro plan?", replyText: "$9/mo." },
    { host: "x.com", path: "/ada/status/1234567890" }
  );
  expect(result).toEqual({ status: "sent" });
  expect(fixture.sent()).toBe(1);
});

function linkedinFixture({ withSendButton = true }: { withSendButton?: boolean } = {}) {
  document.body.innerHTML = `
    <div class="comments-comment-item">
      <span class="actor">Amy</span>
      <p class="comments-comment-item__comment-text">How much is it?</p>
      <button class="trigger">Reply</button>
      <div class="editor" style="display:none">
        <textarea class="reply-input"></textarea>
        ${withSendButton ? `<button class="send" disabled>Reply</button>` : ""}
      </div>
    </div>`;
  const editor = document.querySelector(".editor") as HTMLElement;
  const send = document.querySelector(".send") as HTMLButtonElement | null;
  document.querySelector(".trigger")!.addEventListener("click", () => {
    editor.style.display = "block";
    if (send) send.disabled = false;
  });
  let sent = 0;
  send?.addEventListener("click", () => { sent += 1; });
  return { editor, send, sent: () => sent };
}

it("clicks the comment's reply trigger, types the reply and clicks send", async () => {
  const fixture = linkedinFixture();
  const result = await pageAutomationTask(
    { op: "send", platform: "linkedin", commentText: "How much is it?", replyText: "It is 128 RMB." },
    { host: "www.linkedin.com" }
  );
  expect(result).toEqual({ status: "sent" });
  expect((fixture.editor.querySelector(".reply-input") as HTMLTextAreaElement).value).toBe("It is 128 RMB.");
  expect(fixture.sent()).toBe(1);
});

it("reports typed when the editor opens but no send button exists", async () => {
  const fixture = linkedinFixture({ withSendButton: false });
  const result = await pageAutomationTask(
    { op: "send", platform: "linkedin", commentText: "How much is it?", replyText: "It is 128 RMB." },
    { host: "www.linkedin.com" }
  );
  expect(result).toEqual({ status: "typed" });
  expect((fixture.editor.querySelector(".reply-input") as HTMLTextAreaElement).value).toBe("It is 128 RMB.");
});

it("asks for vision fallback when the target comment is not on the page", async () => {
  document.body.innerHTML = `<div class="comments-comment-item"><p class="comments-comment-item__comment-text">Unrelated</p></div>`;
  const result = await pageAutomationTask(
    { op: "send", platform: "linkedin", commentText: "How much is it?", replyText: "x" },
    { host: "www.linkedin.com" }
  );
  expect(result).toEqual({ status: "needs_vision" });
});

it("types into a contenteditable found at the vision-located point and clicks the located send button", async () => {
  document.body.innerHTML = `
    <div class="comments-comment-item">
      <div class="editor"><div class="ce-input" contenteditable="true"></div></div>
      <button class="send" disabled>Send</button>
    </div>`;
  const ceInput = document.querySelector(".ce-input") as HTMLElement;
  const send = document.querySelector(".send") as HTMLButtonElement;
  let sent = 0;
  send.addEventListener("click", () => { sent += 1; });
  // Real platforms enable the send button only once the editor has content.
  ceInput.addEventListener("input", () => { send.disabled = false; });
  const original = document.elementFromPoint;
  document.elementFromPoint = (x: number) => (x >= 300 ? send : ceInput.parentElement);
  try {
    const result = await pageAutomationTask(
      { op: "visionSend", replyText: "Here it is", inputPoint: { x: 0.1, y: 0.1 }, sendPoint: { x: 0.4, y: 0.2 } },
      { host: "www.linkedin.com" }
    );
    expect(result).toEqual({ status: "sent" });
    expect(ceInput.textContent).toContain("Here it is");
    expect(sent).toBe(1);
  } finally {
    document.elementFromPoint = original;
  }
});
