import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkbenchProvider } from "@/components/workbench/WorkbenchProvider";
import { FirstTaskWorkbench } from "@/components/workbench/FirstTaskWorkbench";
import { readFirstTaskDraft, saveFirstTaskDraft } from "@/lib/first-task";
import { computeKitCost, PLAN_CREDITS } from "@/lib/payment/types";

const m = vi.hoisted(() => ({ push: vi.fn(), capture: vi.fn(), generated: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("@/lib/posthog", () => ({ captureEvent: m.capture }));
vi.mock("@/lib/theme", () => ({ getStoredLocale: () => "zh" }));
vi.mock("@/components/ui/Toast", () => ({ addToast: vi.fn() }));
vi.mock("@/lib/brand-brain", () => ({ getBrandBrain: () => ({}), loadPersistedBrandBrain: async () => ({ brain: {} }) }));
vi.mock("@/lib/guardrails", () => ({ getStoredCustomGuardrails: () => [], loadPersistedCustomGuardrails: async () => ({ rules: [] }) }));
vi.mock("@/components/workbench/OutputBoard", () => ({ OutputBoard: ({ outputs }: { outputs: Array<{ body: string }> }) => <div>{outputs.map((o, i) => <p key={i}>{o.body}</p>)}</div> }));
vi.mock("@/lib/sse-client", () => ({ consumeSSEStream: async (_response: unknown, emit: (event: string, data: unknown) => void) => {
  const outputs = [{ id: "o1", platform: "xiaohongshu", title: "Test", body: "真实测试结果", cta: "", notes: "", strategy: "" }, { id: "o2", platform: "wechat", title: "Test", body: "第二份测试结果", cta: "", notes: "", strategy: "" }];
  for (const output of outputs) emit("output", { output });
  emit("done", { kit: { id: "91d9deae-0883-4b22-8a95-80fc382c29c9", ideaText: "用户实际输入内容", goal: "lead-gen", persona: "ai-saas", platforms: ["xiaohongshu", "wechat"], mediaAssets: [], outputs, createdAt: new Date().toISOString(), status: "saved" }, allowance: { used: 18, limit: 50, available: 32, plan: "free" } });
} }));

let authenticated = false;
beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }, clear: () => values.clear()
  } });
  vi.clearAllMocks(); authenticated = false;
  window.history.replaceState({}, "", "/workbench?start=1");
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => {
    if (url === "/api/entitlements/check") return new Response(JSON.stringify({ authenticated, plan: "free", canUseOutputs: authenticated, monthlyLimit: 50, used: 0, available: authenticated ? 50 : 0 }));
    if (url === "/api/kits") return new Response(JSON.stringify({ kits: [] }));
    if (url === "/api/generate") { m.generated(JSON.parse(String(init?.body))); return new Response(""); }
    return new Response("{}");
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function view(draftId?: string) { return render(<WorkbenchProvider><FirstTaskWorkbench draftId={draftId} /></WorkbenchProvider>); }
const source = "这是我们本周推出的真实产品更新，请为独立开发者整理成两份可发布的内容。";

describe("first task through authentication", () => {
  it("shows the input requirement and measures editing without sending source text", async () => {
    view();
    const input = screen.getByLabelText("这次想分享什么？");
    await waitFor(() => expect(input).toBeEnabled());
    const submit = screen.getByRole("button", { name: "保存内容，免费注册后生成" });
    expect(submit).toBeDisabled();
    expect(screen.getByText("再写 20 个字，就可以继续。")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "真实更新" } });
    expect(screen.getByText("再写 16 个字，就可以继续。")).toBeInTheDocument();
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: source } });
    expect(submit).toBeEnabled();
    fireEvent.change(input, { target: { value: source + "补充" } });
    expect(m.capture.mock.calls.filter(([name]) => name === "first_task_input_started")).toHaveLength(1);
    expect(m.capture.mock.calls.filter(([name]) => name === "first_task_input_ready")).toHaveLength(1);
    expect(JSON.stringify(m.capture.mock.calls)).not.toContain(source);
    expect(m.generated).not.toHaveBeenCalled();
  });
  it("includes a restored ready draft in the funnel without generating or requiring another edit", async () => {
    const draft = { id: crypto.randomUUID(), text: source, platforms: ["xiaohongshu", "wechat"] as ["xiaohongshu", "wechat"], locale: "zh" as const, savedAt: Date.now() };
    saveFirstTaskDraft(draft);
    view(draft.id);
    await waitFor(() => expect(screen.getByLabelText("这次想分享什么？")).toHaveValue(source));
    expect(m.capture).toHaveBeenCalledWith("first_task_input_ready", expect.objectContaining({ first_task_id: draft.id, input_source: "restored", first_task_ui_version: 2 }));
    const names = m.capture.mock.calls.map(([name]) => name);
    expect(names.indexOf("first_task_viewed")).toBeLessThan(names.indexOf("first_task_input_ready"));
    expect(names).not.toContain("first_task_input_started");
    expect(m.generated).not.toHaveBeenCalled();
  });
  it("preserves the user's source and choices through signup, and only generates on explicit confirmation", async () => {
    const first = view();
    await waitFor(() => expect(screen.getByLabelText("这次想分享什么？")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("这次想分享什么？"), { target: { value: source } });
    fireEvent.click(screen.getByRole("button", { name: "保存内容，免费注册后生成" }));
    await waitFor(() => expect(m.push).toHaveBeenCalledOnce());
    const saved = readFirstTaskDraft()!;
    expect(saved.text).toBe(source);
    expect(m.push.mock.calls[0][0]).not.toContain(encodeURIComponent(source));
    expect(m.generated).not.toHaveBeenCalled();
    first.unmount(); authenticated = true;
    window.history.replaceState({}, "", `/workbench?start=1&draft=${saved.id}`);
    view(saved.id);
    await waitFor(() => expect(screen.getByLabelText("这次想分享什么？")).toHaveValue(source));
    expect(m.generated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "生成我的两份草稿" }));
    await screen.findByText("真实测试结果");
    expect(m.generated).toHaveBeenCalledWith(expect.objectContaining({ ideaText: source, platforms: ["xiaohongshu", "wechat"], visualMode: "none", analytics: expect.objectContaining({ entry_point: "first_task", first_task_id: saved.id }) }));
    expect(PLAN_CREDITS.free).toBeGreaterThanOrEqual(computeKitCost(2));
    expect(JSON.stringify(m.capture.mock.calls)).not.toContain(source);
    expect(readFirstTaskDraft()?.kitId).toBe("91d9deae-0883-4b22-8a95-80fc382c29c9");
  });
  it("does not redirect and lose text when browser storage rejects the handoff", async () => {
    view();
    await waitFor(() => expect(screen.getByLabelText("这次想分享什么？")).toBeEnabled());
    const write = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    fireEvent.change(screen.getByLabelText("这次想分享什么？"), { target: { value: source } });
    fireEvent.click(screen.getByRole("button", { name: "保存内容，免费注册后生成" }));
    expect(m.push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("浏览器暂时无法保存草稿");
    expect(screen.getByLabelText("这次想分享什么？")).toHaveValue(source);
    write.mockRestore();
  });
});
