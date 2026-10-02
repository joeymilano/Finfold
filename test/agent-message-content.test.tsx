import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentMessageContent } from "@/components/app-shell/AgentMessageContent";

describe("AgentMessageContent", () => {
  it("lets RTL replies choose their own direction and logical alignment", () => {
    const { container } = render(
      <AgentMessageContent content="لقد راجعت البيانات، وهذه هي الخطوة التالية." />
    );

    const content = container.querySelector("[data-agent-message-content]");
    expect(content).toHaveAttribute("dir", "auto");
    expect(content).toHaveClass("text-start");
  });

  it("renders model Markdown as calm, readable conversation instead of source syntax", () => {
    const { container } = render(
      <AgentMessageContent content={`### 诊断结论\n\n我已经看完，**目前证据不足**。\n\n- 先补登录后的数据\n- 再决定是否调整内容\n\n| 指标 | 状态 |\n| --- | --- |\n| 推荐流量 | 待确认 |`} />
    );

    expect(screen.getByRole("heading", { name: "诊断结论" })).toBeInTheDocument();
    expect(screen.getByText("目前证据不足").tagName).toBe("STRONG");
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(container.textContent).not.toContain("###");
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).not.toContain("| --- |");
  });

  it("does not execute raw HTML returned by a model", () => {
    const { container } = render(
      <AgentMessageContent content={'结果正常。<script data-testid="unsafe">alert(1)</script>'} />
    );

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container).toHaveTextContent("结果正常。");
  });

  it("renders rich provider text parts without leaking object coercion", () => {
    const { container } = render(
      <AgentMessageContent content={[
        { type: "text", text: "我已经完成诊断。" },
        { type: "text", text: { value: "下一步只修改标题。" } }
      ]} />
    );

    expect(container).toHaveTextContent("我已经完成诊断。");
    expect(container).toHaveTextContent("下一步只修改标题。");
    expect(container.textContent).not.toContain("[object Object]");
  });

  it("removes unrecoverable legacy object tokens from stored replies", () => {
    const { container } = render(
      <AgentMessageContent content="诊断完成。\n\n[object Object]\n\n请查看证据卡。" />
    );

    expect(container).toHaveTextContent("诊断完成。");
    expect(container).toHaveTextContent("请查看证据卡。");
    expect(container.textContent).not.toContain("[object Object]");
  });
});
