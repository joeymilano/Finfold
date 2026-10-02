import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { AgentContentWorkflowStateCard } from "@/components/app-shell/AgentContentWorkflowStateCard";
import type { AgentContentWorkflow } from "@/lib/agent/content-workflow";

const baseWorkflow: AgentContentWorkflow = {
  id: "aa59c844-1e9d-46d1-9d64-5f0613a333c0",
  platform: "x",
  status: "active",
  stage: "ready",
  request: {
    platform: "x",
    ideaText: "Turn this verified product update into a useful X thread for independent founders.",
    goal: "audience-growth",
    persona: "indie-builder",
    language: "en"
  },
  kitId: "c6630d3d-ae5c-4137-bd02-f1e41dcdbd19",
  generationRequestId: null,
  generationRunId: "24d6aebf-dfa9-440b-8c31-30c355ff1a70",
  completionReceipt: {
    title: "X 内容包已保存",
    summary: "已保存 3 个 X 内容输出，尚未对外发布。",
    contentKitId: "c6630d3d-ae5c-4137-bd02-f1e41dcdbd19",
    platform: "x",
    outputCount: 3,
    persistedAt: "2026-08-06T10:00:00.000Z"
  },
  createdAt: "2026-08-06T09:00:00.000Z",
  updatedAt: "2026-08-06T10:00:00.000Z"
};

describe("Agent content workflow status card", () => {
  it("uses the persisted receipt and opens its exact editable content package", () => {
    render(<AgentContentWorkflowStateCard workflows={[baseWorkflow]} locale="zh" />);

    expect(screen.getByText("已保存 3 个 X 内容输出，尚未对外发布。")).toBeTruthy();
    expect(screen.getByRole("link", { name: "打开内容包" }).getAttribute("href")).toBe("/kits/c6630d3d-ae5c-4137-bd02-f1e41dcdbd19");
    expect(screen.queryByText("已发布")).toBeNull();
  });

  it("shows a factual in-progress state before the package is persisted", () => {
    render(<AgentContentWorkflowStateCard workflows={[{
      ...baseWorkflow,
      platform: "wechat",
      stage: "generating",
      kitId: null,
      completionReceipt: null
    }]} locale="en" />);

    expect(screen.getByText("WeChat content package is generating")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open content package" })).toBeNull();
  });

  it("offers an explicit retry only for an active persisted draft", () => {
    render(<AgentContentWorkflowStateCard workflows={[{
      ...baseWorkflow,
      stage: "draft",
      kitId: null,
      completionReceipt: null
    }]} locale="en" />);

    expect(screen.getByRole("button", { name: "Retry generation" })).toBeTruthy();
  });
});