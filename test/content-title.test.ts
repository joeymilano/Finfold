import { describe, expect, it } from "vitest";
import {
  canonicalContentTitle,
  cleanContentTitle,
  displayContentTitle,
  isUsableContentTitle
} from "@/lib/content-title";

describe("content title normalization", () => {
  it("shows honest localized fallbacks for missing and placeholder titles", () => {
    for (const title of ["", "   ", "N/A", "n / a", "null", "Untitled", "---"]) {
      expect(isUsableContentTitle(title)).toBe(false);
      expect(displayContentTitle(title, "zh")).toBe("无标题");
      expect(displayContentTitle(title, "en")).toBe("Untitled");
    }
  });

  it("replaces broken encoding instead of exposing mojibake", () => {
    for (const title of ["新品发布 �", "MÃ¼nchen launch", "ä¸­æ–‡æ ‡é¢˜", "ï¿½ï¿½"]) {
      expect(isUsableContentTitle(title)).toBe(false);
      expect(canonicalContentTitle(title)).toBe("Untitled");
    }
  });

  it("keeps normal Chinese, English, emoji, and removes hidden control characters", () => {
    expect(displayContentTitle("一次真实更新，五个平台", "zh")).toBe("一次真实更新，五个平台");
    expect(displayContentTitle("Launch notes 🚀", "en")).toBe("Launch notes 🚀");
    expect(cleanContentTitle("正常\u0000标题")).toBe("正常标题");
  });
});
