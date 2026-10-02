import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Bot, resolveFinfoldIconProvider } from "@/components/ui/icons";
import type { FontAwesomeSnapshotDefinition } from "@/components/ui/fontawesome-icon-types";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_FINFOLD_ICON_PROVIDER;
  cleanup();
});

describe("Finfold icon provider fallback", () => {
  it("uses the local Font Awesome snapshot by default", () => {
    render(<Bot aria-label="Agent" />);

    const icon = screen.getByRole("img", { name: "Agent" });
    expect(icon.getAttribute("data-fin-icon")).toBe("Bot");
    expect(icon.getAttribute("data-fin-icon-provider")).toBe("fontawesome");
    expect(icon.getAttribute("data-prefix")).toBe("fasds");
    expect(icon.querySelector(".fa-primary")).not.toBeNull();
    expect(icon.querySelector(".fa-secondary")).not.toBeNull();
  });

  it("forces the matching Lucide icon through the emergency switch", () => {
    process.env.NEXT_PUBLIC_FINFOLD_ICON_PROVIDER = "lucide";
    render(<Bot aria-label="Agent" />);

    const icon = screen.getByRole("img", { name: "Agent" });
    expect(icon.getAttribute("data-fin-icon")).toBe("Bot");
    expect(icon.getAttribute("data-fin-icon-provider")).toBe("lucide");
    expect(icon.classList.contains("lucide-bot")).toBe(true);
  });

  it("falls back automatically when local Font Awesome data is invalid", () => {
    const invalidDefinition = {
      prefix: "fas",
      iconName: "broken",
      icon: [0, 0, [], "", ""]
    } as unknown as FontAwesomeSnapshotDefinition;

    expect(resolveFinfoldIconProvider(invalidDefinition)).toBe("lucide");
  });
});
