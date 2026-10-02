/** @jest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchIntelligenceEvalClient } from "@/components/admin/ResearchIntelligenceEvalClient";
import {
  buildBlindReviewerPack,
  buildOperatorAnswerKey,
  RESEARCH_INTELLIGENCE_FILE_KINDS
} from "@/lib/research-intelligence-eval-files";
import type { ResearchIntelligenceEvalCase, ResearchIntelligenceEvalDataset } from "@/lib/research-intelligence-eval";

vi.mock("@/components/ui/Panel", () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

// Older jsdom builds lack Blob/File#text(); polyfill with FileReader so the
// import flows under test behave as in a real browser.
if (typeof File.prototype.text !== "function") {
  Object.defineProperty(File.prototype, "text", {
    value(this: File) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    }
  });
}

const readyMission = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "创始人市场切口研究",
  objective: "验证创始人内容的市场切口",
  status: "ready",
  decision: {},
  createdAt: "2026-08-17T00:00:00.000Z",
};

const evaluationCase: ResearchIntelligenceEvalCase = {
  id: "10000000-0000-4000-8000-000000000001",
  missionId: "20000000-0000-4000-8000-000000000001",
  createdAt: "2026-08-17T00:00:00.000Z",
  brief: {
    ideaText: "Finfold 使用真实市场证据帮助小团队生成平台原生内容。",
    goal: "lead-gen",
    persona: "ai-saas",
    platform: "xiaohongshu",
    language: "zh"
  },
  intelligenceContext: {
    missionId: "20000000-0000-4000-8000-000000000001",
    missionTitle: "AI 内容机会",
    question: "哪些问题值得优先验证？",
    executiveSummary: "用户需要更具体的步骤。",
    opportunities: [{ title: "流程拆解", rationale: "用户需要执行证据。", evidenceIds: ["E1"], confidence: "medium" }],
    strategy: { thesis: "用流程回应执行焦虑。", contentPillars: ["流程"], conversionPath: "笔记 → 主页" },
    evidence: [{ id: "E1", sourceType: "public_web", title: "公开观察", excerpt: "用户反复询问如何把想法变成稳定流程。", reliability: "observed" }],
    limitations: ["公开观察不能证明因果。"]
  },
  control: {
    output: {
      platform: "xiaohongshu",
      title: "控制组标题样例",
      body: "先写清用户问题，再给出一份可以执行和复盘的步骤。",
      cta: "保存这份检查单",
      notes: "使用一组可比较的内容变量。",
      strategy: "围绕真实用户问题组织内容。"
    },
    generation: {
      modelTier: "haiku",
      durationMs: 1000,
      attempts: [{
        provider: "test", model: "test-model", promptVersion: "test-v1",
        inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.01
      }],
      estimatedCostUsd: 0.01
    }
  },
  treatment: {
    output: {
      platform: "xiaohongshu",
      title: "情报组标题样例",
      body: "用真实证据回答用户最关心的执行问题。",
      cta: "保存这份检查单",
      notes: "使用一组可比较的内容变量。",
      strategy: "围绕真实用户问题组织内容。"
    },
    generation: {
      modelTier: "haiku",
      durationMs: 1100,
      attempts: [{
        provider: "test", model: "test-model", promptVersion: "test-v1",
        inputTokens: 120, outputTokens: 60, totalTokens: 180, estimatedCostUsd: 0.012
      }],
      estimatedCostUsd: 0.012
    }
  }
};

const dataset: ResearchIntelligenceEvalDataset = {
  version: 2,
  title: "Research intelligence blind test",
  blindSeed: "ui-test-blind-seed",
  createdAt: "2026-08-17T00:00:00.000Z",
  cases: [evaluationCase]
};

function jsonFile(payload: unknown, filename: string) {
  const body = JSON.stringify(payload);
  const file = new File([body], filename, { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => body });
  return file;
}

function reviewerPackFile() {
  return jsonFile(buildBlindReviewerPack(dataset), "pack.json");
}

function answerKeyFile() {
  const answerKey = buildOperatorAnswerKey({ dataset, reviews: [], failedCalls: [], provenance: null });
  return jsonFile(answerKey, "answer-key.json");
}

async function importFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).not.toBeNull();
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value)
    }
  });
});

describe("ResearchIntelligenceEvalClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not load evaluation data for a non-admin viewer", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    render(<ResearchIntelligenceEvalClient initialAuthorized={false} />);

    expect(screen.getByText("该工作台仅对管理员开放。"))
      .toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the two-real-model-calls boundary and gates without generating", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ missions: [readyMission] }),
    } as Response);

    await act(async () => {
      render(<ResearchIntelligenceEvalClient initialAuthorized />);
    });

    expect(await screen.findByRole("heading", { name: "Research 情报盲测工作台" }))
      .toBeInTheDocument();
    expect(screen.getAllByText(/真实调用模型两次|真实模型调用 ×2/).length).toBeGreaterThan(0);
    expect(screen.getByText(/系统不会扣 Finfold Credits/))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成 1 组（模型调用 ×2）" }))
      .toBeEnabled();
    expect(screen.getByText("样本 0/30"))
      .toBeInTheDocument();
    expect(screen.getAllByText("样本任务覆盖").length)
      .toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/operations/research", { cache: "no-store" });
  });

  it("no longer offers a manual cross-tenant checkbox", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ missions: [readyMission] }),
    } as Response);
    await act(async () => {
      render(<ResearchIntelligenceEvalClient initialAuthorized />);
    });
    const checkboxes = screen.queryAllByRole("checkbox");
    expect(checkboxes).toHaveLength(0);
    expect(screen.getByText(/不再接受手动勾选|不再支持手动勾选/)).toBeInTheDocument();
  });

  it("reviewer mode accepts only a blind reviewer pack and never shows arm data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ missions: [readyMission] }),
    } as Response);
    await act(async () => {
      render(<ResearchIntelligenceEvalClient initialAuthorized />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /盲评台/ }));
    });

    expect(screen.getByText(/只能导入 Blind Reviewer Pack/)).toBeInTheDocument();

    // An operator answer key must be rejected: it contains the arm mapping.
    await importFile(answerKeyFile());
    await waitFor(() => {
      expect(screen.getByText(/导入失败/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/情报组标题样例/)).not.toBeInTheDocument();
    expect(screen.queryByText(/围绕真实用户问题组织内容。/)).not.toBeInTheDocument();

    // A genuine reviewer pack loads and shows blinded candidates without the
    // strategy hint or any arm label.
    await importFile(reviewerPackFile());
    await waitFor(() => {
      expect(screen.getByText(/已导入盲评文件/)).toBeInTheDocument();
    });
    expect(screen.getByText("候选 A")).toBeInTheDocument();
    expect(screen.getByText("候选 B")).toBeInTheDocument();
    const pageText = document.body.textContent ?? "";
    expect(pageText).not.toContain("围绕真实用户问题组织内容。");
    expect(pageText).not.toContain("ui-test-blind-seed");
    expect(pageText).not.toContain(RESEARCH_INTELLIGENCE_FILE_KINDS.operatorAnswerKey);
  });

  it("persists a reviewer session across a page reload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ missions: [readyMission] }),
    } as Response);
    const { unmount } = await act(async () => {
      const rendered = render(<ResearchIntelligenceEvalClient initialAuthorized />);
      return rendered;
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /盲评台/ }));
    });
    await importFile(reviewerPackFile());
    await waitFor(() => {
      expect(screen.getByText(/已导入盲评文件/)).toBeInTheDocument();
    });
    unmount();

    await act(async () => {
      render(<ResearchIntelligenceEvalClient initialAuthorized />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /盲评台/ }));
    });
    await waitFor(() => {
      expect(screen.getByText(/已从本浏览器恢复未完成会话/)).toBeInTheDocument();
    });
    expect(screen.getByText("候选 A")).toBeInTheDocument();
  });
});
