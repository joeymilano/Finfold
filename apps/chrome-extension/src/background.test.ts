import { beforeEach, expect, it, vi } from "vitest";

type MessageListener = (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => unknown;
const messageListeners = new Set<MessageListener>();
let tabsQuery: ReturnType<typeof vi.fn>;
let executeScript: ReturnType<typeof vi.fn>;

const page = {
  url: "https://www.linkedin.com/feed/",
  title: "Feed",
  siteName: "LinkedIn",
  description: "",
  language: "en",
  text: "A feed post long enough to pass the extractor minimum.",
  selectionUsed: false
};

beforeEach(async () => {
  messageListeners.clear();
  vi.resetModules();
  vi.unstubAllGlobals();
  tabsQuery = vi.fn();
  executeScript = vi.fn();
  vi.stubGlobal("chrome", {
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn((listener: MessageListener) => { messageListeners.add(listener); }) }
    },
    contextMenus: { removeAll: vi.fn(), create: vi.fn(), onClicked: { addListener: vi.fn() } },
    sidePanel: { setPanelBehavior: vi.fn(async () => undefined), open: vi.fn(async () => undefined) },
    storage: {
      session: {
        get: vi.fn(async () => ({})), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined),
        setAccessLevel: vi.fn(async () => undefined)
      },
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined), setAccessLevel: vi.fn(async () => undefined) }
    },
    tabs: { query: tabsQuery, get: vi.fn(async () => ({ id: 1 })) },
    scripting: { executeScript }
  });
  await import("./background");
});

function requestContext(): Promise<{ ok: boolean; code?: string }> {
  return new Promise((resolve) => {
    messageListeners.forEach((listener) => { listener({ type: "GET_PAGE_CONTEXT" }, {}, resolve as (response: unknown) => void); });
  });
}

it("reads the page when the URL is invisible because access was not granted yet", async () => {
  // Site access defaults to "on click" since Chrome 137: without a granted
  // host permission or activeTab, tab.url is undefined but executeScript can
  // still succeed (e.g. granted after the panel already opened).
  tabsQuery.mockResolvedValue([{ id: 7 }]);
  executeScript.mockResolvedValue([{ result: page }]);
  const response = await requestContext();
  expect(response.ok).toBe(true);
  expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 7 } }));
});

it("still refuses restricted pages whose URL is visible", async () => {
  tabsQuery.mockResolvedValue([{ id: 7, url: "chrome://settings/" }]);
  const response = await requestContext();
  expect(response).toMatchObject({ ok: false, code: "RESTRICTED_PAGE" });
  expect(executeScript).not.toHaveBeenCalled();
});

it("reports PERMISSION_DENIED, not RESTRICTED_PAGE, when injection is refused", async () => {
  tabsQuery.mockResolvedValue([{ id: 7 }]);
  executeScript.mockRejectedValue(new Error("Cannot access contents of the page"));
  const response = await requestContext();
  expect(response).toMatchObject({ ok: false, code: "PERMISSION_DENIED" });
});
