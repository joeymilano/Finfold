import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FirstKitGuide } from "@/components/workbench/FirstKitGuide";

describe("FirstKitGuide", () => {
  it("guides a new user with real progress instead of sample outputs", () => {
    const onStart = vi.fn();
    render(
      <FirstKitGuide
        locale="zh"
        sourceLength={0}
        platformCount={3}
        onStart={onStart}
      />
    );

    expect(screen.getByText("从只有你知道的真实素材开始。")).toBeInTheDocument();
    expect(screen.getByText("还需要 20 个字")).toBeInTheDocument();
    expect(screen.getByText("已选择 3 个平台")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33");

    fireEvent.click(screen.getByRole("button", { name: "粘贴第一份素材" }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("advances the progress copy when the source is ready", () => {
    render(
      <FirstKitGuide
        locale="en"
        sourceLength={42}
        platformCount={2}
        onStart={() => undefined}
      />
    );

    expect(screen.getByText("42 characters ready")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "67");
    expect(screen.getByRole("button", { name: "Continue setup" })).toBeInTheDocument();
  });
});
