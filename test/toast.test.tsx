import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { addToast, ToastContainer } from "@/components/ui/Toast";

describe("ToastContainer", () => {
  it("constrains success icons to a supported Tailwind size", () => {
    render(<ToastContainer />);

    act(() => addToast("success", "Generation queued", 10_000));

    const message = screen.getByText("Generation queued");
    const icon = message.parentElement?.querySelector("svg");
    expect(icon).toHaveClass("h-5", "w-5");
    expect(icon).not.toHaveClass("h-4.5", "w-4.5");
  });
});