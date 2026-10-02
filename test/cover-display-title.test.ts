import { describe, expect, it } from "vitest";
import { formatCoverDisplayTitle } from "@/lib/cover/display-title";

describe("cover display title", () => {
  it("gives a Chinese Xiaohongshu payoff its own line without changing characters", () => {
    const original = "一个更新写7遍太痛了";
    const formatted = formatCoverDisplayTitle(original, "xiaohongshu");
    expect(formatted).toBe("一个更新写7遍\n太痛了");
    expect(formatted.replace("\n", "")).toBe(original);
  });

  it("preserves explicit art direction and non-Xiaohongshu titles", () => {
    expect(formatCoverDisplayTitle("同一份内容\n不该重写7遍", "xiaohongshu")).toBe("同一份内容\n不该重写7遍");
    expect(formatCoverDisplayTitle("同一份内容不该重写7遍", "wechat")).toBe("同一份内容不该重写7遍");
    expect(formatCoverDisplayTitle("Stop rewriting one update", "xiaohongshu")).toBe("Stop rewriting one update");
  });
});
