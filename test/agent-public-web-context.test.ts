import { describe, expect, it } from "vitest";
import {
  appendCurrentPublicWebEvidence,
  extractCurrentTurnPublicUrls,
  readCurrentTurnPublicWeb
} from "@/lib/agent/public-web-context";

describe("Agent current-turn public web context", () => {
  it("extracts natural URL forms, normalizes them, and removes duplicates", () => {
    expect(extractCurrentTurnPublicUrls(
      "帮我看 [www.missionget.com](http://www.missionget.com)，再对比 example.ai/pricing。"
    )).toEqual([
      "http://www.missionget.com/",
      "https://example.ai/pricing"
    ]);
  });

  it("ignores credentialed and local URLs before any read", () => {
    expect(extractCurrentTurnPublicUrls(
      "https://user:secret@example.com https://localhost/admin http://127.0.0.1/private"
    )).toEqual([]);
  });

  it("turns readable pages into bounded evidence and preserves page-specific failures", async () => {
    const context = await readCurrentTurnPublicWeb(
      "诊断 https://www.missionget.com 和 https://app.example.com/private",
      {
        readPage: async (url) => url.includes("missionget") ? {
            url,
            ok: true,
            httpStatus: 200,
            title: "Mission Get",
            text: `Goal execution product ${"visible evidence ".repeat(400)}`,
            isXiaohongshu: false,
            loginWalled: false,
            limitation: null
          }
        : {
            url,
            ok: true,
            httpStatus: 200,
            title: "Sign in",
            text: "Login",
            isXiaohongshu: false,
            loginWalled: true,
            limitation: "页面疑似需要登录。"
          },
        searchWeb: async ({ targetUrls }) => ({
          available: true,
          provider: "dashscope_web_search",
          capturedAt: "2026-09-04T00:00:00.000Z",
          text: "The private page is an authenticated workspace, according to the indexed product documentation.",
          sources: [{
            index: 1,
            title: "Example docs",
            url: "https://docs.example.com/workspaces",
            snippet: "Authenticated workspace documentation"
          }],
          targetUrls
        })
      }
    );

    const { pages } = context;
    expect(pages[0]).toMatchObject({ readable: true, title: "Mission Get" });
    expect(pages[0].text.length).toBeLessThanOrEqual(4_000);
    expect(pages[1]).toMatchObject({ readable: false, limitation: "页面疑似需要登录。" });
    expect(context.indexedEvidence).toMatchObject({ available: true });
    const message = appendCurrentPublicWebEvidence("请诊断这两个网站", context);
    expect(message).toContain("CURRENT PUBLIC WEB EVIDENCE");
    expect(message).toContain('"status":"readable"');
    expect(message).toContain('"status":"unavailable"');
    expect(message).toContain("https://docs.example.com/workspaces");
    expect(message).toContain("Do not claim Finfold cannot access external websites in general");
  });

  it("does not spend a search call when every direct page is readable", async () => {
    let searchCalls = 0;
    const context = await readCurrentTurnPublicWeb("看 https://example.com", {
      readPage: async (url) => ({
        url,
        ok: true,
        httpStatus: 200,
        title: "Example",
        text: "A sufficiently detailed public page body. ".repeat(4),
        isXiaohongshu: false,
        loginWalled: false,
        limitation: null
      }),
      searchWeb: async () => {
        searchCalls += 1;
        return {
          available: false,
          reason: "provider_failed",
          limitation: "unexpected",
          targetUrls: []
        };
      }
    });

    expect(searchCalls).toBe(0);
    expect(context.indexedEvidence).toBeNull();
  });

  it("keeps the chat path alive when indexed recovery itself fails", async () => {
    const context = await readCurrentTurnPublicWeb("看 https://blocked.example.com", {
      readPage: async (url) => ({
        url,
        ok: false,
        httpStatus: 999,
        title: "",
        text: "",
        isXiaohongshu: false,
        loginWalled: true,
        limitation: "页面返回 HTTP 999。"
      }),
      searchWeb: async () => {
        throw new Error("provider outage");
      }
    });

    expect(context.pages[0]).toMatchObject({ readable: false, httpStatus: 999 });
    expect(context.indexedEvidence).toMatchObject({
      available: false,
      reason: "provider_failed"
    });
  });
});
