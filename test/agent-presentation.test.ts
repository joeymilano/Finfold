import { describe, expect, it } from "vitest";
import { collapseAgentToolEventsForDisplay } from "@/lib/agent/presentation";

describe("Agent tool event presentation", () => {
  it("collapses a repaired account investigation into the successful report", () => {
    const events = collapseAgentToolEventsForDisplay([
      {
        name: "investigate_social_account",
        args: {
          accountUrl: "https://www.xiaohongshu.com/user/profile/example",
          imageUrls: ["private-attachment-id"]
        },
        result: { error: "Invalid url" }
      },
      {
        name: "investigate_social_account",
        args: { accountUrl: "https://www.xiaohongshu.com/user/profile/example" },
        result: {
          investigation: {
            accountUrl: "https://www.xiaohongshu.com/user/profile/example",
            reportId: "FF-XHS-1"
          }
        }
      }
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.result).toMatchObject({
      investigation: { reportId: "FF-XHS-1" }
    });
  });

  it("keeps investigations for different accounts separate", () => {
    const events = collapseAgentToolEventsForDisplay([
      { name: "investigate_social_account", args: { accountUrl: "https://x.com/first" }, result: { investigation: {} } },
      { name: "investigate_social_account", args: { accountUrl: "https://x.com/second" }, result: { investigation: {} } }
    ]);

    expect(events).toHaveLength(2);
  });

  it("collapses analyze + save of the same creator style profile into one card", () => {
    const profile = {
      creatorName: "张雪峰",
      profileUrl: "https://www.xiaohongshu.com/user/profile/zhangxuefeng"
    };
    const events = collapseAgentToolEventsForDisplay([
      {
        name: "analyze_creator_style",
        result: { creatorStyleProfile: profile, nextActions: ["用于下一篇内容"] }
      },
      {
        name: "save_creator_style_profile",
        args: { profile },
        result: { creatorStyleProfile: profile, learnedStyleCount: 3, auditId: "audit-1", reversible: true }
      }
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe("save_creator_style_profile");
    expect(events[0]?.result).toMatchObject({ learnedStyleCount: 3, auditId: "audit-1" });
  });

  it("keeps profiles for different creators separate", () => {
    const events = collapseAgentToolEventsForDisplay([
      {
        name: "analyze_creator_style",
        result: { creatorStyleProfile: { creatorName: "创作者A", profileUrl: "https://x.com/a" } }
      },
      {
        name: "analyze_creator_style",
        result: { creatorStyleProfile: { creatorName: "创作者B", profileUrl: "https://x.com/b" } }
      }
    ]);

    expect(events).toHaveLength(2);
  });

  it("collapses a re-asked ask_user question set into one card, keeping the latest", () => {
    const questions = [{
      id: "angle",
      question: "你希望这篇内容通过哪种视角来呈现？",
      options: [{ label: "产品/设计美学视角" }, { label: "上海本地生活视角" }, { label: "情感/恋爱导师视角" }],
      recommended: "产品/设计美学视角"
    }];
    const events = collapseAgentToolEventsForDisplay([
      { name: "ask_user", result: { askedUser: true, questions } },
      { name: "ask_user", result: { askedUser: true, questions: questions.map((question) => ({ ...question })) } }
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe("ask_user");
  });

  it("keeps ask_user cards for genuinely different questions separate", () => {
    const events = collapseAgentToolEventsForDisplay([
      {
        name: "ask_user",
        result: {
          askedUser: true,
          questions: [{ id: "angle", question: "用哪种视角？", options: [{ label: "A" }, { label: "B" }] }]
        }
      },
      {
        name: "ask_user",
        result: {
          askedUser: true,
          questions: [{ id: "platform", question: "发哪个平台？", options: [{ label: "小红书" }, { label: "X" }] }]
        }
      }
    ]);

    expect(events).toHaveLength(2);
  });
});
