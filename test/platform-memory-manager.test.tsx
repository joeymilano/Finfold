import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { PlatformMemoryManager } from "@/components/memory/PlatformMemoryManager";
import { brandBrainSchema } from "@/lib/brand-brain";

describe("PlatformMemoryManager", () => {
  it("adds a high-confidence manual platform preference only after an explicit action", () => {
    const onChange = vi.fn();
    render(<PlatformMemoryManager brain={brandBrainSchema.parse({})} locale="en" onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. On X, lead with the concrete trade-off"), {
      target: { value: "Lead with a concrete trade-off." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add platform memory" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      platformMemory: [expect.objectContaining({
        platform: "xiaohongshu",
        kind: "preference",
        source: "manual",
        confidence: "high",
        value: "Lead with a concrete trade-off."
      })]
    }));
  });
});