import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BugReportButton } from "@/components/app-shell/BugReportButton";
import { bugReportRequestSchema, sendBugReportEmail } from "@/lib/bug-report";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as Response);
}

function createLocalStorageMock() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    }
  };
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createLocalStorageMock()
  });
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("BugReportButton", () => {
  it("lets users hide the floating trigger and remembers the choice", () => {
    const { unmount } = render(<BugReportButton />);

    fireEvent.click(screen.getByRole("button", { name: "隐藏反馈按钮" }));
    expect(screen.queryByRole("button", { name: "反馈BUG" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("finfold-bug-report-trigger-dismissed-v1")).toBe("1");

    unmount();
    render(<BugReportButton />);
    expect(screen.queryByRole("button", { name: "反馈BUG" })).not.toBeInTheDocument();
  });

  it("opens a modal and confirms only after the report reaches the API", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ submitted: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BugReportButton />);
    fireEvent.click(screen.getByRole("button", { name: "反馈BUG" }));

    fireEvent.change(screen.getByLabelText("一句话概括"), {
      target: { value: "保存后页面一直转圈" }
    });
    fireEvent.change(screen.getByLabelText("发生了什么"), {
      target: { value: "我点击保存内容包后，页面持续显示加载状态。" }
    });
    fireEvent.change(screen.getByLabelText("如何复现（选填）"), {
      target: { value: "打开工作台，然后点击保存。" }
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "反馈BUG" }));

    expect(await screen.findByText("已经送到我的邮箱")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload).toMatchObject({
      title: "保存后页面一直转圈",
      description: "我点击保存内容包后，页面持续显示加载状态。",
      steps: "打开工作台，然后点击保存。",
      locale: "zh"
    });
    expect(payload.pageUrl).toMatch(/^http/);
  });

  it("keeps the modal open and explains a delivery failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ error: "邮件通道暂时不可用。" }, 503)));

    render(<BugReportButton />);
    fireEvent.click(screen.getByRole("button", { name: "反馈BUG" }));
    fireEvent.change(screen.getByLabelText("一句话概括"), {
      target: { value: "页面无法保存内容" }
    });
    fireEvent.change(screen.getByLabelText("发生了什么"), {
      target: { value: "点击保存按钮以后没有任何响应，内容也没有保存。" }
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "反馈BUG" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("邮件通道暂时不可用。");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("bug report delivery", () => {
  it("validates report length and page context", () => {
    expect(bugReportRequestSchema.safeParse({
      title: "bad",
      description: "too short",
      pageUrl: "not-a-url",
      locale: "zh"
    }).success).toBe(false);
  });

  it("sends to the founder inbox, sets reply-to, and escapes report HTML", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("BUG_REPORT_NOTIFY_EMAIL", "joey@example.com");
    const resendFetch = vi.fn(() => jsonResponse({ id: "email-1" }));
    vi.stubGlobal("fetch", resendFetch);

    const result = await sendBugReportEmail({
      title: "Broken <button>",
      description: "Clicking <script>alert(1)</script> breaks the page.",
      steps: "Open & click",
      pageUrl: "https://www.finfold.app/workbench",
      userAgent: "Test browser",
      locale: "en",
      userId: "user-1",
      userEmail: "reporter@example.com"
    });

    expect(result).toEqual({ sent: true, id: "email-1" });
    await waitFor(() => expect(resendFetch).toHaveBeenCalledTimes(1));
    const [, init] = resendFetch.mock.calls[0] as unknown as [string, RequestInit];
    const message = JSON.parse(String(init.body));
    expect(message.to).toEqual(["joey@example.com"]);
    expect(message.reply_to).toBe("reporter@example.com");
    expect(message.html).toContain("Broken &lt;button&gt;");
    expect(message.html).not.toContain("<script>");
  });
});
