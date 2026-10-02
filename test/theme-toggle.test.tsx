import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "zh" }));

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value)
    }
  });
});

describe("ThemeToggle", () => {
  it("shows the light-mode Lightbulb action while dark mode is active", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<ThemeToggle />);

    const button = await screen.findByRole("button", { name: "切换到亮色主题" });

    await waitFor(() => {
      expect(button.querySelector('[data-fin-icon="Lightbulb"]')).toBeInTheDocument();
    });
    expect(button.querySelector('[data-fin-icon="Sun"]')).not.toBeInTheDocument();

    fireEvent.click(button);

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(button).toHaveAccessibleName("切换到暗色主题");
    expect(button.querySelector('[data-fin-icon="Moon"]')).toBeInTheDocument();
  });
});