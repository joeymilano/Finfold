import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublishingHandoffStudio } from "@/components/workbench/PublishingHandoffStudio";
import type { KitOutput } from "@/lib/content-schema";

const baseOutput: KitOutput = {
  id: "handoff-output",
  platform: "wechat",
  title: "从内容生成走向真实增长闭环",
  body: "这是一篇用于检验发布交接流程的长文。".repeat(40),
  cta: "保存这份发布检查清单",
  notes: "",
  strategy: "",
  imageUrl: "https://example.com/cover.jpg",
  locked: false,
  publishStatus: "draft",
  userEdited: false
};

describe("PublishingHandoffStudio", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows separate copy controls and the official WeChat editor", () => {
    render(
      <PublishingHandoffStudio
        output={baseOutput}
        locale="zh"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: "公众号发布交接" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制标题" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制正文" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开公众号后台" })).toHaveAttribute("href", "https://mp.weixin.qq.com/");
    expect(screen.getByText(/登录、最终预览与提交仍由你确认/)).toBeInTheDocument();
  });

  it("routes Xiaohongshu image preparation back to the 3:4 carousel workflow", () => {
    const onPrepareImages = vi.fn();
    render(
      <PublishingHandoffStudio
        output={{ ...baseOutput, platform: "xiaohongshu", title: "内容增长别只看爆款" }}
        locale="zh"
        onPrepareImages={onPrepareImages}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "准备 3:4 图组" }));
    expect(onPrepareImages).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "打开小红书创作中心" })).toHaveAttribute(
      "href",
      "https://creator.xiaohongshu.com/publish/publish"
    );
  });

  it("shows one-confirmation smart publishing only for a truly capable account", async () => {
    const onScheduled = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/settings/social-connections") {
        return new Response(JSON.stringify({
          connections: [{
            connectorId: "wechat",
            status: "connected",
            accounts: [{
              id: "11111111-1111-4111-8111-111111111111",
              displayName: "Finfold 测试公众号",
              handle: null,
              isSelected: true,
              publishingCapability: {
                canCreateDraft: true,
                canSubmitPublish: true,
                blockers: [],
                verified: true,
                serviceType: 2
              }
            }]
          }]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/operations/program/tasks") {
        return new Response(JSON.stringify({ queue: null }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        accepted: true,
        job: {
          id: "22222222-2222-4222-8222-222222222222",
          mode: "scheduled_publish",
          status: "scheduled",
          statusLabel: "已安排，等待后台处理",
          scheduledFor: "2026-08-27T10:00:00.000Z",
          articleUrl: null,
          error: null
        }
      }), { status: 202, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PublishingHandoffStudio
        output={{
          ...baseOutput,
          id: "33333333-3333-4333-8333-333333333333",
          updatedAt: "2026-08-26T12:00:00.000Z"
        }}
        kitId="44444444-4444-4444-8444-444444444444"
        locale="zh"
        onScheduled={onScheduled}
        onClose={vi.fn()}
      />
    );

    const confirm = await screen.findByRole("button", { name: "确认并安排发布" });
    expect(screen.getByTestId("wechat-smart-publishing")).toBeInTheDocument();
    expect(screen.getByText("Finfold 测试公众号")).toBeInTheDocument();
    fireEvent.click(confirm);
    await waitFor(() => expect(onScheduled).toHaveBeenCalledWith("scheduled_publish"));
    expect(await screen.findByText("已安排，等待后台处理")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/wechat-publications"))).toBe(true);
  });

  it("distributes to every checked account in one confirmation", async () => {
    const onScheduled = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/settings/social-connections") {
        return new Response(JSON.stringify({
          connections: [{
            connectorId: "wechat",
            status: "connected",
            accounts: [
              {
                id: "aaaaaaaa-1111-4111-8111-111111111111",
                displayName: "矩阵号 A",
                handle: null,
                isSelected: true,
                publishingCapability: { canCreateDraft: true, canSubmitPublish: true, blockers: [], verified: true, serviceType: 2 }
              },
              {
                id: "aaaaaaaa-2222-4222-8222-222222222222",
                displayName: "矩阵号 B",
                handle: null,
                isSelected: false,
                publishingCapability: { canCreateDraft: true, canSubmitPublish: false, blockers: ["unverified"], verified: false, serviceType: null }
              }
            ]
          }]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/operations/program/tasks") {
        return new Response(JSON.stringify({ queue: null }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as { accountId: string; mode: string };
      return new Response(JSON.stringify({
        accepted: true,
        job: {
          id: `job-${body.accountId.slice(-12)}`,
          mode: body.mode,
          status: body.mode === "scheduled_publish" ? "scheduled" : "draft_ready",
          statusLabel: body.mode === "scheduled_publish" ? "已安排，等待后台处理" : "草稿已同步",
          scheduledFor: "2026-08-27T10:00:00.000Z",
          articleUrl: null,
          error: null
        }
      }), { status: 202, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PublishingHandoffStudio
        output={{
          ...baseOutput,
          id: "bbbbbbbb-3333-4333-8333-333333333333",
          updatedAt: "2026-08-26T12:00:00.000Z"
        }}
        kitId="44444444-4444-4444-8444-444444444444"
        locale="zh"
        onScheduled={onScheduled}
        onClose={vi.fn()}
      />
    );

    await screen.findByText("矩阵号 A");
    fireEvent.click(screen.getByRole("checkbox", { name: /矩阵号 B/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认并安排发布" }));

    await waitFor(() => expect(onScheduled).toHaveBeenCalledWith("scheduled_publish"));
    const publicationCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/wechat-publications"));
    expect(publicationCalls).toHaveLength(2);
    const requestedAccountIds = publicationCalls.map(([, init]) => (JSON.parse(String(init?.body ?? "{}")) as { accountId: string }).accountId);
    expect(requestedAccountIds).toContain("aaaaaaaa-1111-4111-8111-111111111111");
    expect(requestedAccountIds).toContain("aaaaaaaa-2222-4222-8222-222222222222");
    const requestedModes = publicationCalls.map(([, init]) => (JSON.parse(String(init?.body ?? "{}")) as { mode: string }).mode);
    expect(requestedModes).toContain("draft_only");
    expect(await screen.findByText(/矩阵号 A · 已安排，等待后台处理/)).toBeInTheDocument();
    expect(await screen.findByText(/矩阵号 B · 草稿已同步/)).toBeInTheDocument();
  });
});
