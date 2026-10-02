import { describe, expect, it } from "vitest";
import {
  InvalidImageCaptureOcrResponseError,
  parseImageCaptureOcrResponse
} from "@/lib/image-capture-ocr";

describe("image capture OCR response parsing", () => {
  it("keeps useful output when a provider exceeds the requested length limits", () => {
    const result = parseImageCaptureOcrResponse(JSON.stringify({
      summary: "这是一段超过八十个字符的总结。".repeat(10),
      keyPoints: ["• 这是一个超过四十个字符但仍然包含有效内容、过去会导致整份视觉结果被静默丢弃的要点。".repeat(2)]
    }));

    expect(Array.from(result.summary)).toHaveLength(80);
    expect(Array.from(result.keyPoints[0])).toHaveLength(40);
  });

  it("accepts fenced JSON and the common key_points alias", () => {
    expect(parseImageCaptureOcrResponse(`\`\`\`json
      {"summary":"产品更新","key_points":["新增截图提取","支持自动回填"]}
    \`\`\``)).toEqual({
      summary: "产品更新",
      keyPoints: ["新增截图提取", "支持自动回填"]
    });
  });

  it("preserves an explicit empty result for the no-content response", () => {
    expect(parseImageCaptureOcrResponse('{"summary":"","keyPoints":[]}')).toEqual({
      summary: "",
      keyPoints: []
    });
  });

  it.each(["{}", "not json", '{"summary":42,"keyPoints":[]}']) (
    "rejects malformed provider output instead of disguising it as no content: %s",
    (raw) => {
      expect(() => parseImageCaptureOcrResponse(raw)).toThrow(InvalidImageCaptureOcrResponseError);
    }
  );
});
