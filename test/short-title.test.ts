import { describe, expect, it } from "vitest";
import { deriveShortTitle } from "@/lib/cover/short-title";

describe("deriveShortTitle", () => {
  it("strips bracketed prefixes", () => {
    expect(deriveShortTitle("【重磅】我们上线了新功能", "zh")).not.toMatch(/^【/);
  });

  it("strips emoji", () => {
    const result = deriveShortTitle("🔥这个方法让我省了3小时🔥", "zh");
    expect(result).not.toMatch(/🔥/);
  });

  it("splits on punctuation and prefers the clause with a digit", () => {
    const result = deriveShortTitle("为什么很多人做错了：我们用了3个月验证了这个方法", "zh");
    expect(result).toContain("3");
  });

  it("falls back to the first clause when no clause has a digit", () => {
    const result = deriveShortTitle("先立问题，再给解法，最后升华结论", "zh");
    expect(result).toBe("先立问题");
  });

  it("caps Chinese output at 12 characters", () => {
    const long = "这是一段非常非常非常非常非常非常长的中文标题内容";
    const result = deriveShortTitle(long, "zh");
    expect(result.length).toBeLessThanOrEqual(12);
  });

  it("caps English output at 6 words", () => {
    const long = "This is a very long English headline that should be shortened";
    const result = deriveShortTitle(long, "en");
    expect(result.split(/\s+/).length).toBeLessThanOrEqual(6);
  });

  it("strips trailing particles", () => {
    const result = deriveShortTitle("这个方法真的很好用的", "zh");
    expect(result.endsWith("的")).toBe(false);
  });

  it("passes short titles through mostly unchanged", () => {
    const result = deriveShortTitle("三个月做到10万收入", "zh");
    expect(result).toBe("三个月做到10万收入");
  });
});
