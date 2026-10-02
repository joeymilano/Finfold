import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LocalDeviceRadarPanel } from "@/components/app-shell/LocalDeviceRadarPanel";
import { LocalDevicesTab } from "@/components/settings/LocalDevicesTab";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));
vi.mock("@/lib/supabase-client", () => ({ createSupabaseBrowserClient: vi.fn() }));

import { createSupabaseBrowserClient } from "@/lib/supabase-client";
const createClientMock = vi.mocked(createSupabaseBrowserClient);

function chain(final: Promise<{ data: unknown; error: null }>) {
  const thenable = { then: final.then.bind(final), catch: final.catch.bind(final) };
  const query = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnValue(thenable),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue(thenable),
    delete: vi.fn().mockReturnThis(),
  };
  return query;
}

function makeClient(overrides: { from?: ReturnType<typeof chain>; rpc?: Promise<{ data: unknown; error: null }> } = {}) {
  const query = overrides.from ?? chain(Promise.resolve({ data: [], error: null }));
  return {
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn().mockReturnValue(overrides.rpc ?? Promise.resolve({ data: null, error: null })),
  } as unknown as ReturnType<typeof createSupabaseBrowserClient>;
}

describe("LocalDevicesTab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("空设备时显示引导文案", async () => {
    createClientMock.mockReturnValue(makeClient());
    render(<LocalDevicesTab />);
    await waitFor(() => expect(screen.getByText(/还没有连接本地设备/)).toBeInTheDocument());
    expect(screen.getByText("添加设备")).toBeInTheDocument();
  });

  it("注册设备后一次性展示密钥", async () => {
    createClientMock.mockReturnValue(makeClient({
      from: chain(Promise.resolve({ data: [{ id: "d1", device_name: "Joey 的 Mac", version: null, capabilities: null, last_seen: null, created_at: "2026-09-28" }], error: null })),
      rpc: Promise.resolve({ data: [{ id: "d1", device_name: "Joey 的 Mac", device_key: "abc123secretkey", created_at: "2026-09-28" }], error: null }),
    }));
    render(<LocalDevicesTab />);
    fireEvent.click(screen.getByText("添加设备"));
    await waitFor(() => expect(screen.getByText("abc123secretkey")).toBeInTheDocument());
    expect(screen.getByText(/请现在复制设备密钥/)).toBeInTheDocument();
  });

  it("渲染已有设备列表", async () => {
    createClientMock.mockReturnValue(makeClient({
      from: chain(Promise.resolve({ data: [
        { id: "d1", device_name: "Joey 的 Mac", version: "0.3", capabilities: {}, last_seen: new Date().toISOString(), created_at: "2026-09-28" },
      ], error: null })),
    }));
    render(<LocalDevicesTab />);
    await waitFor(() => expect(screen.getByText("Joey 的 Mac")).toBeInTheDocument());
    expect(screen.getByText("在线")).toBeInTheDocument();
  });
});

describe("LocalDeviceRadarPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("无设备时引导去设置", async () => {
    createClientMock.mockReturnValue(makeClient());
    render(<LocalDeviceRadarPanel />);
    await waitFor(() => expect(screen.getByText(/先到设置里添加/)).toBeInTheDocument());
  });

  it("有设备时可输入主题并下发", async () => {
    createClientMock.mockReturnValue(makeClient({
      from: chain(Promise.resolve({ data: [{ id: "d1", device_name: "Joey 的 Mac", last_seen: null }], error: null })),
      rpc: Promise.resolve({ data: "task-uuid-1", error: null }),
    }));
    render(<LocalDeviceRadarPanel />);
    await waitFor(() => expect(screen.getByText("在设备上扫描")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/主题，如 AI 视频生成/), { target: { value: "AI 视频生成" } });
    fireEvent.click(screen.getByText("在设备上扫描"));
    await waitFor(() =>
      expect(screen.queryByText(/已排队，等待设备认领|Mac 正在采集|候选已回传|运行失败/)).not.toBeNull()
    );
  });
});
