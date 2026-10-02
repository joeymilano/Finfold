import { describe, expect, it } from "vitest";
import { buildUserMessageWithEvidence } from "@/lib/agent/session-context";

describe("Agent session evidence context", () => {
  it("keeps prior attachment identity and data imports without replaying private signed URLs", () => {
    const result = buildUserMessageWithEvidence("截图给你了，继续诊断。", {
      dataImportIds: ["import-123"],
      attachments: [{
        id: "6a512f31-a595-4a32-a58f-fd33920282f8",
        name: "analytics.png",
        size: 1024,
        kind: "image",
        mimeType: "image/png",
        storagePath: "user/private/analytics.png",
        url: "https://private.example/signed-secret"
      }]
    }, "history");

    expect(result).toContain("SESSION EVIDENCE");
    expect(result).toContain("reuse it and do not ask for it again");
    expect(result).toContain("id=6a512f31-a595-4a32-a58f-fd33920282f8");
    expect(result).toContain('name="analytics.png"');
    expect(result).toContain("data_import_id: import-123");
    expect(result).not.toContain("signed-secret");
    expect(result).not.toContain("storagePath");
  });

  it("leaves messages unchanged when no reusable evidence exists", () => {
    expect(buildUserMessageWithEvidence("继续", {}, "history")).toBe("继续");
  });
});
