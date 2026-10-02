import { describe, expect, it } from "vitest";
import { dedupePastedFiles } from "@/lib/agent/attachments";

const file = (name: string, size: number, type: string) => ({ name, size, type });

describe("dedupePastedFiles", () => {
  it("collapses an macOS-style dual-format screenshot paste to one PNG", () => {
    const pasted = [
      file("image.tiff", 480_000, "image/tiff"),
      file("image.png", 320_000, "image/png")
    ];
    const result = dedupePastedFiles(pasted);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("image/png");
  });

  it("keeps a single pasted image untouched", () => {
    const pasted = [file("screenshot.png", 120_000, "image/png")];
    expect(dedupePastedFiles(pasted)).toEqual(pasted);
  });

  it("drops exact duplicates (same name and size)", () => {
    const pasted = [
      file("report.pdf", 90_000, "application/pdf"),
      file("report.pdf", 90_000, "application/pdf")
    ];
    expect(dedupePastedFiles(pasted)).toHaveLength(1);
  });

  it("keeps distinct non-image files from a multi-file paste", () => {
    const pasted = [
      file("notes.docx", 12_000, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      file("data.csv", 4_000, "text/csv")
    ];
    expect(dedupePastedFiles(pasted)).toHaveLength(2);
  });
});
