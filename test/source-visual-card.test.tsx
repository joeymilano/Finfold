import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SourceVisualCard } from "@/components/workbench/SourceVisualCard";

const onModeChange = vi.fn();
const onSelect = vi.fn();

function setup(mode: "source_first" | "none" | "ai_generate") {
  onModeChange.mockClear();
  return render(
    <SourceVisualCard
      locale="zh"
      mode={mode}
      source={null}
      candidates={[]}
      canGenerateAi
      platformCount={2}
      onModeChange={onModeChange}
      onSelect={onSelect}
    />
  );
}

function chip(label: string) {
  return screen.getByRole("button", { name: new RegExp(label) });
}

describe("SourceVisualCard mode chips", () => {
  it("highlights only the active chip per mode", () => {
    for (const mode of ["source_first", "none", "ai_generate"] as const) {
      const { unmount } = setup(mode);
      const labels = mode === "source_first" ? ["智能查找"] : mode === "none" ? ["不使用"] : ["AI 生成"];
      const idle = mode === "source_first" ? ["不使用", "AI 生成"] : mode === "none" ? ["智能查找", "AI 生成"] : ["智能查找", "不使用"];
      for (const label of labels) {
        expect(chip(label).className).toContain("bg-action/10");
      }
      for (const label of idle) {
        expect(chip(label).className).not.toContain("bg-action/10");
      }
      unmount();
    }
  });

  it("switches the highlight when the user picks another mode", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SourceVisualCard
        locale="zh"
        mode="source_first"
        source={null}
        candidates={[]}
        canGenerateAi
        platformCount={2}
        onModeChange={onModeChange}
        onSelect={onSelect}
      />
    );
    await user.click(chip("不使用"));
    expect(onModeChange).toHaveBeenCalledWith("none");
    rerender(
      <SourceVisualCard
        locale="zh"
        mode="none"
        source={null}
        candidates={[]}
        canGenerateAi
        platformCount={2}
        onModeChange={onModeChange}
        onSelect={onSelect}
      />
    );
    expect(chip("不使用").className).toContain("bg-action/10");
    expect(chip("智能查找").className).not.toContain("bg-action/10");

    await user.click(chip("AI 生成"));
    expect(onModeChange).toHaveBeenCalledWith("ai_generate");
  });
});
