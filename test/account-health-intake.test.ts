import { describe, expect, it } from "vitest";
import { parseAccountHealthIntake } from "@/lib/account-health-intake";

describe("account health smart intake", () => {
  it("detects a Xiaohongshu profile and infers a reach concern", () => {
    expect(parseAccountHealthIntake("https://www.xiaohongshu.com/user/profile/abc 最近曝光突然下降")).toMatchObject({
      accountUrl: "https://www.xiaohongshu.com/user/profile/abc",
      platform: "xiaohongshu",
      concern: "low_reach",
      evidenceText: "最近曝光突然下降",
      analyticsText: "最近曝光突然下降"
    });
  });

  it("detects X and keeps post copy for phrase-level scanning", () => {
    expect(parseAccountHealthIntake("https://x.com/finfold 保证三天涨粉一万，评论区扣1")).toMatchObject({
      platform: "x",
      concern: "general",
      evidenceText: "保证三天涨粉一万，评论区扣1"
    });
  });

  it("detects Reddit profiles and moderator removal evidence", () => {
    expect(parseAccountHealthIntake("https://reddit.com/u/example Post was removed by the moderator")).toMatchObject({
      platform: "reddit",
      concern: "content_removed"
    });
  });

  it("detects LinkedIn personal profiles and Xiaohongshu share short links", () => {
    expect(parseAccountHealthIntake("https://www.linkedin.com/in/jane-doe 最近帖子曝光很低")).toMatchObject({
      accountUrl: "https://www.linkedin.com/in/jane-doe",
      platform: "linkedin",
      concern: "low_reach"
    });
    expect(parseAccountHealthIntake("帮我看看领英账号最近的数据")).toMatchObject({ platform: "linkedin" });
    expect(parseAccountHealthIntake("https://xhslink.cn/o/3QRuDSWEZio 体检一下")).toMatchObject({
      accountUrl: "https://xhslink.cn/o/3QRuDSWEZio",
      platform: "xiaohongshu"
    });
  });

  it("does not mistake a post URL for an account profile", () => {
    expect(parseAccountHealthIntake("https://reddit.com/r/startups/comments/example why no reach").accountUrl).toBeUndefined();
  });

  it("splits several labeled posts without asking the user to sort them", () => {
    const parsed = parseAccountHealthIntake([
      "小红书",
      "Post 1：保证三天涨粉一万",
      "Post 2：评论区扣 1 领资料"
    ].join("\n"));

    expect(parsed.platform).toBe("xiaohongshu");
    expect(parsed.posts).toEqual([
      { text: "保证三天涨粉一万" },
      { text: "评论区扣 1 领资料" }
    ]);
  });

  it("keeps analytics as evidence instead of pretending it is a post", () => {
    const parsed = parseAccountHealthIntake("小红书 最近 7 天曝光 1200，推荐流量下降 80%");
    expect(parsed.analyticsText).toContain("曝光 1200");
    expect(parsed.posts).toEqual([]);
  });
});
