import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavLink } from "@/components/app-shell/NavLink";
import { PlatformSelector } from "@/components/workbench/PlatformSelector";
import { Home } from "@/components/ui/icons";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("motion/react", () => ({
  motion: {
    span: ({ children, layoutId: _layoutId, ...props }: React.HTMLAttributes<HTMLSpanElement> & { layoutId?: string }) => <span {...props}>{children}</span>
  }
}));

describe("authenticated app interaction semantics", () => {
  it("marks the current navigation destination", () => {
    render(<NavLink href="/dashboard" label="Dashboard" description="Overview" icon={Home} />);
    expect(screen.getByRole("link", { name: /Dashboard/ })).toHaveAttribute("aria-current", "page");
  });

  it("uses aria-pressed and a restrained teal selection surface", () => {
    const onChange = vi.fn();
    render(<PlatformSelector value={["wechat"]} onChange={onChange} locale="en" />);

    const selected = screen.getAllByTestId("platform-wechat")[0];
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(selected.className).toContain("border-action/55");
    expect(selected.className).not.toContain("bg-brand");

    fireEvent.click(selected);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows one localized region badge per desktop platform card", () => {
    const { rerender } = render(<PlatformSelector value={[]} onChange={vi.fn()} locale="zh" />);
    const chineseCard = screen.getAllByTestId("platform-wechat")[0];

    expect(chineseCard).toHaveTextContent("国内");
    expect(chineseCard).not.toHaveTextContent("China");
    expect(chineseCard).not.toHaveTextContent("平台语感");

    rerender(<PlatformSelector value={[]} onChange={vi.fn()} locale="en" />);
    const englishCard = screen.getAllByTestId("platform-wechat")[0];
    expect(englishCard).toHaveTextContent("China");
    expect(englishCard).not.toHaveTextContent("Platform voice");
  });

  it("lists Global platforms before China platforms in English, reversed in Chinese", () => {
    const { rerender } = render(<PlatformSelector value={[]} onChange={vi.fn()} locale="en" />);
    const before = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    const x = screen.getAllByTestId("platform-x")[0];
    const xiaohongshu = screen.getAllByTestId("platform-xiaohongshu")[0];
    const wechat = screen.getAllByTestId("platform-wechat")[0];
    expect(before(x, xiaohongshu)).toBe(true);
    expect(before(xiaohongshu, wechat)).toBe(true);

    rerender(<PlatformSelector value={[]} onChange={vi.fn()} locale="zh" />);
    const xZh = screen.getAllByTestId("platform-x")[0];
    const xiaohongshuZh = screen.getAllByTestId("platform-xiaohongshu")[0];
    expect(before(xiaohongshuZh, xZh)).toBe(true);
  });

  it("blocks a seventh platform while keeping selected platforms removable", () => {
    const onChange = vi.fn();
    const selected = ["wechat", "xiaohongshu", "zhihu", "moments", "x", "linkedin"] as const;
    render(<PlatformSelector value={[...selected]} onChange={onChange} locale="zh" maxSelection={6} />);

    const blocked = screen.getAllByTestId("platform-instagram")[0];
    expect(blocked).toBeDisabled();
    expect(screen.getAllByText("单次最多 6 个，生成更快更稳")[0]).toBeInTheDocument();

    const removable = screen.getAllByTestId("platform-zhihu")[0];
    expect(removable).not.toBeDisabled();
    fireEvent.click(removable);
    expect(onChange).toHaveBeenCalledWith(["wechat", "xiaohongshu", "moments", "x", "linkedin"]);
  });
});
