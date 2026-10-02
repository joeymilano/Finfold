import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthSplit } from "@/components/app-shell/AuthSplit";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "en" }));
vi.mock("@/lib/posthog", () => ({
  captureEvent: vi.fn(),
  identifyAnalyticsUser: vi.fn()
}));
vi.mock("motion/react", () => ({
  motion: new Proxy({}, { get: (_target, tag) => tag })
}));
vi.mock("@/components/app-shell/FishLogo", () => ({ FishLogo: () => null }));
vi.mock("@/components/ui/BorderBeam", () => ({ BorderBeam: () => null }));
vi.mock("@/components/theme/LocaleToggle", () => ({ LocaleToggle: () => null }));
vi.mock("@/components/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

describe("ChatGPT connection auth resume", () => {
  const returnTo = "/oauth/consent?authorization_id=12345678-1234-4234-8234-123456789012";

  it("explains the return to ChatGPT and keeps it when switching to signup", () => {
    render(<AuthSplit mode="login" returnTo={returnTo} initialError="oauth" />);

    expect(screen.getByRole("heading", { name: "Sign in to continue connecting" })).toBeInTheDocument();
    expect(screen.getByText(/return to the requesting app/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("original connection request is still saved");
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/signup?next=%2Foauth%2Fconsent%3Fauthorization_id%3D12345678-1234-4234-8234-123456789012"
    );
  });
});
