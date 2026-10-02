// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentComposer } from "@/components/app-shell/AgentComposer";
import { type AgentDepth } from "@/lib/agent/depth";

/** Mirrors the real parents: they own depth state and feed it back in. */
function ControlledComposer(overrides: Partial<Parameters<typeof AgentComposer>[0]> = {}) {
  const [depth, setDepth] = useState<AgentDepth>("low");
  return (
    <AgentComposer
      locale="zh"
      value=""
      onChange={() => undefined}
      onSubmit={() => undefined}
      sending={false}
      onStop={() => undefined}
      onFiles={() => undefined}
      placeholder="输入"
      depth={depth}
      onDepthChange={setDepth}
      {...overrides}
    />
  );
}

afterEach(() => {
  cleanup();
  if (typeof window.localStorage?.clear === "function") window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("AgentComposer thinking-depth picker", () => {
  it("defaults to low and opens a three-tier menu", () => {
    render(<ControlledComposer />);

    fireEvent.click(screen.getByRole("button", { name: "思考深度: 低" }));

    expect(screen.getByRole("menu", { name: "思考深度" })).toBeInTheDocument();
    for (const level of ["低", "中", "高"] as const) {
      expect(screen.getByRole("menuitemradio", { name: new RegExp(level) })).toBeInTheDocument();
    }
    expect(screen.getByRole("menuitemradio", { name: /^低/ })).toHaveAttribute("aria-checked", "true");
  });

  it("plus button opens the add menu, and the depth trigger's halo stays inside itself", () => {
    render(<ControlledComposer />);

    // The depth trigger pads its tap area with an ::after positioned -inset-1;
    // without `relative` that halo escapes to the shared button-row container and
    // swallows clicks meant for the plus button (jsdom can't hit-test, so guard
    // the class that keeps the halo contained).
    const depthTrigger = screen.getByRole("button", { name: "思考深度: 低" });
    expect(depthTrigger.className).toContain("relative");

    fireEvent.click(screen.getByRole("button", { name: "添加或使用自动化" }));
    expect(screen.getByRole("menu", { name: "添加与自动化" })).toBeInTheDocument();
    expect(screen.queryByRole("menu", { name: "思考深度" })).not.toBeInTheDocument();
  });

  it("switches tiers, closes the menu, and reflects the choice on the trigger", () => {
    render(<ControlledComposer />);

    fireEvent.click(screen.getByRole("button", { name: "思考深度: 低" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^高/ }));

    expect(screen.queryByRole("menu", { name: "思考深度" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "思考深度: 高" })).toBeInTheDocument();
  });

  it("stays usable while a task is running — switching only affects the next run", () => {
    render(<ControlledComposer sending />);

    const trigger = screen.getByRole("button", { name: "思考深度: 低" });
    expect(trigger).toBeEnabled();
    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "思考深度" })).toBeInTheDocument();
  });
});
