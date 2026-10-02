import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, buttonStyles } from "@/components/ui/Button";

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: [number, number, number]) {
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(foreground: [number, number, number], background: [number, number, number]) {
  const brighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (brighter + 0.05) / (darker + 0.05);
}

describe("authenticated app design system", () => {
  it("exposes distinct semantic button variants", () => {
    expect(buttonStyles({ variant: "primary" })).toContain("bg-brand");
    expect(buttonStyles({ variant: "primary" })).toContain("text-on-brand");
    expect(buttonStyles({ variant: "secondary" })).toContain("border-action/45");
    expect(buttonStyles({ variant: "tertiary" })).toContain("border-hairline");
    expect(buttonStyles({ variant: "danger" })).toContain("text-risk");
  });

  it("keeps disabled and loading states accessible", () => {
    render(<Button loading>Generate</Button>);
    const button = screen.getByRole("button", { name: "Generate" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.className).toContain("focus-ring");
    expect(button.className).toContain("disabled:opacity-45");
  });

  it("meets the planned text and focus contrast floors", () => {
    const lightAction: [number, number, number] = [15, 118, 110];
    const darkAction: [number, number, number] = [45, 212, 191];
    const lightBackground: [number, number, number] = [245, 244, 239];
    const darkBackground: [number, number, number] = [11, 10, 8];
    const lightBrand: [number, number, number] = [181, 128, 61];
    const lightOnBrand: [number, number, number] = [18, 24, 33];

    expect(contrast(lightAction, [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(darkAction, [7, 22, 21])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(lightBrand, lightOnBrand)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(lightAction, lightBackground)).toBeGreaterThanOrEqual(3);
    expect(contrast(darkAction, darkBackground)).toBeGreaterThanOrEqual(3);
  });
});
