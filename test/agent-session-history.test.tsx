import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentSessionHistory } from "@/components/app-shell/AgentSessionHistory";

const session = {
  id: "session-1",
  title: "诊断小红书账号",
  updated_at: "2026-08-17T08:00:00.000Z"
};

describe("AgentSessionHistory", () => {
  it("keeps deletion behind management mode and an explicit confirmation", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onDelete = vi.fn(async () => undefined);

    render(
      <AgentSessionHistory
        sessions={[session]}
        currentSessionId="session-1"
        locale="zh"
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );

    expect(screen.queryByRole("button", { name: "删除对话: 诊断小红书账号" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "管理" }));
    await user.click(screen.getByRole("button", { name: "删除对话: 诊断小红书账号" }));

    expect(screen.getByText("删除后无法恢复")).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确认删除: 诊断小红书账号" }));
    expect(onDelete).toHaveBeenCalledWith(session);
  });

  it("continues a conversation from the normal history view", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <AgentSessionHistory
        sessions={[session]}
        currentSessionId={null}
        locale="zh"
        onSelect={onSelect}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "诊断小红书账号" }));
    expect(onSelect).toHaveBeenCalledWith(session);
  });
});
