import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommercialAssetLibrary } from "@/components/brand/CommercialAssetLibrary";
import { Switch } from "@/components/ui/Switch";
import { assetSourceNotes } from "@/lib/ops-data";

describe("brand rules UI", () => {
  it("uses an accessible switch with a stable checked state", () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked label="广告行业规则" onCheckedChange={onCheckedChange} />);

    const control = screen.getByRole("switch", { name: "广告行业规则" });
    expect(control).toHaveAttribute("aria-checked", "true");
    fireEvent.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it("keeps the commercial library collapsed until requested", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<CommercialAssetLibrary locale="zh" />);

    const title = screen.getByText("商用图库与许可");
    const details = title.closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("includes the stock providers in the approved license registry", () => {
    expect(assetSourceNotes.some((source) => source.source === "Pexels")).toBe(true);
    expect(assetSourceNotes.some((source) => source.source === "Pixabay")).toBe(true);
  });
});
