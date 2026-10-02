import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SignalDiscoveryPanel } from "@/components/app-shell/SignalDiscoveryPanel";
const empty = { status: "not_started", searchCalls: 0, readCount: 0, recommended: 0, sources: [], candidates: [] };
const response = (body: unknown, status=200) => new Response(JSON.stringify(body), { status });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("stays hidden while the server-side rollout is disabled", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => response({ ...empty, status: "disabled" })));
  render(<SignalDiscoveryPanel locale="zh" />);
  await waitFor(() => expect(screen.queryByRole("region", { name: "业务信号发现" })).not.toBeInTheDocument());
});
it("does not crash or claim no demand on malformed or failed responses", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => response({ error: "storage unavailable" })));
  render(<SignalDiscoveryPanel locale="zh" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法获取发现结果");
  expect(screen.queryByText(/本轮没有达到推荐标准/)).not.toBeInTheDocument();
});
it("enqueues explicitly and shows a running job without displaying fake results", async () => {
  const fetchMock = vi.fn().mockImplementationOnce(async () => response(empty)).mockImplementationOnce(async () => response({ id: "job1" },202)).mockImplementationOnce(async () => response({ ...empty,id:"job1",status:"queued",searchCalls:1 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<SignalDiscoveryPanel locale="zh" />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "发现业务信号" }));
  expect(await screen.findByText(/正在后台搜索并核对原文/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "发现业务信号" })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledWith("/api/operations/signals", {method:"POST"});
});
it("distinguishes a platform failure from no matching result and retains original evidence", async () => {
  const completed=vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => response({ ...empty, id:"job1", status:"partial", sources:[{platform:"x",label:"X",status:"failed",found:0},{platform:"reddit",label:"Reddit",status:"no_results",found:0}], candidates:[{url:"https://example.com/post",title:"Original request",sourceLabel:"公开网页",publishedAt:null,excerpt:"Original verifiable excerpt",reason:"原文支持这一业务需求。"}] })));
  render(<SignalDiscoveryPanel locale="zh" onCompleted={completed} />);
  expect(await screen.findByText("X：获取失败")).toBeInTheDocument();
  expect(screen.getByText("Reddit：本轮无匹配来源")).toBeInTheDocument();
  expect(screen.getByText("Original verifiable excerpt")).toBeInTheDocument();
  expect(screen.getByText(/发布时间未知/)).toBeInTheDocument();
  expect(completed).toHaveBeenCalledTimes(1);
});
