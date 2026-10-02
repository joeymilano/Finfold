import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteFooter } from "@/components/landing/SiteFooter";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "en" }));
vi.mock("@/components/app-shell/FishLogo", () => ({ FishLogo: () => null }));

describe("SiteFooter", () => {
  it("links the Good AI Tools badge to the exact Finfold listing", () => {
    render(<SiteFooter locale="en" />);

    const link = screen.getByRole("link", { name: "Good AI Tools" });
    expect(link).toHaveAttribute("href", "https://goodaitools.com/ai/finfold");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
    expect(link).not.toHaveAttribute("rel", expect.stringContaining("nofollow"));

    const badge = screen.getByAltText("Good AI Tools");
    expect(badge).toHaveAttribute(
      "src",
      "https://goodaitools.com/assets/images/badge-dark.png"
    );
    expect(badge).toHaveAttribute("height", "54");
    expect(badge).toHaveAttribute("loading", "lazy");
  });
});
