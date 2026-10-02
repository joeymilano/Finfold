// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { PublishAssist } from "./PublishAssist";

const api = vi.hoisted(() => ({ fetchGrowthTasks: vi.fn(), reportGrowthTaskOutcome: vi.fn() }));
vi.mock("./api", () => api);
vi.mock("./i18n", () => ({ isChinese: true, useUiLocale: () => "zh", uiLocale: "zh", t: {} }));

let root: Root;
let element: HTMLDivElement;
const tabsCreate = vi.fn();

const readyTask = {
  taskId: "task-1",
  missionId: "mission-1",
  variantKey: "A",
  status: "ready" as const,
  draft: { title: "成品展示", body: "正文内容", cta: "去看看" },
  trackingUrl: "https://www.finfold.app/go/abc",
  evidenceUrl: null,
  approvedAt: "2026-09-17T00:00:00.000Z"
};

async function render() {
  await act(async () => {
    root.render(createElement(PublishAssist));
  });
}

function text(): string {
  return element.textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("chrome", { tabs: { create: tabsCreate } });
  element = document.createElement("div");
  document.body.appendChild(element);
  root = createRoot(element);
});

it("stays hidden while there is nothing to assist with", async () => {
  api.fetchGrowthTasks.mockResolvedValue({ tasks: [], featureEnabled: true });
  await render();
  expect(text()).toBe("");
});

it("stays hidden when the feature is off for the account", async () => {
  api.fetchGrowthTasks.mockResolvedValue({ tasks: [readyTask], featureEnabled: false });
  await render();
  expect(text()).toBe("");
});

it("shows an approved draft with its tracking link", async () => {
  api.fetchGrowthTasks.mockResolvedValue({ tasks: [readyTask], featureEnabled: true });
  await render();
  expect(text()).toContain("变体 A");
  expect(text()).toContain("成品展示");
  expect(text()).toContain("https://www.finfold.app/go/abc");
});

async function setInput(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  nativeSetter?.call(input, value);
  await act(async () => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("submits the evidence link and marks the task recorded", async () => {
  api.fetchGrowthTasks
    .mockResolvedValueOnce({ tasks: [readyTask], featureEnabled: true })
    .mockResolvedValue({ tasks: [{ ...readyTask, status: "completed", evidenceUrl: "https://www.xiaohongshu.com/explore/done" }], featureEnabled: true });
  api.reportGrowthTaskOutcome.mockResolvedValue({ result: "confirmed", replayed: false });
  await render();

  const input = element.querySelector<HTMLInputElement>("input[type=url]");
  expect(input).not.toBeNull();
  await setInput(input!, "https://www.xiaohongshu.com/explore/done");
  const submit = [...element.querySelectorAll("button")].find((button) => button.textContent?.includes("提交发布证据"));
  expect(submit).toBeDefined();
  await act(async () => {
    submit!.click();
  });

  expect(api.reportGrowthTaskOutcome).toHaveBeenCalledWith({
    taskId: "task-1",
    outcome: "completed",
    evidenceUrl: "https://www.xiaohongshu.com/explore/done"
  });
  expect(text()).toContain("已提交证据");
});

it("refuses to submit a non-Xiaohongshu link locally before any request", async () => {
  api.fetchGrowthTasks.mockResolvedValue({ tasks: [readyTask], featureEnabled: true });
  await render();
  const input = element.querySelector<HTMLInputElement>("input[type=url]");
  await setInput(input!, "https://example.com/nope");
  const submit = [...element.querySelectorAll("button")].find((button) => button.textContent?.includes("提交发布证据"));
  await act(async () => {
    submit!.click();
  });
  expect(api.reportGrowthTaskOutcome).not.toHaveBeenCalled();
  expect(text()).toContain("请贴入小红书帖子链接");
});
