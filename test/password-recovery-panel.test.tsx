import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordRecoveryPanel } from "@/components/app-shell/PasswordRecoveryPanel";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  refreshAuthUser: vi.fn(),
  replace: vi.fn()
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: mocks.replace }) }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "en" }));
vi.mock("@/lib/posthog", () => ({ captureEvent: mocks.capture }));
vi.mock("@/components/auth/AuthUserProvider", () => ({
  useAuthUser: () => ({ ready: true, user: null, refresh: mocks.refreshAuthUser })
}));
vi.mock("motion/react", () => ({
  motion: new Proxy({}, { get: (_target, tag) => tag })
}));
vi.mock("@/components/app-shell/FishLogo", () => ({ FishLogo: () => null }));
vi.mock("@/components/ui/BorderBeam", () => ({ BorderBeam: () => null }));
vi.mock("@/components/theme/LocaleToggle", () => ({ LocaleToggle: () => null }));
vi.mock("@/components/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("PasswordRecoveryPanel request mode", () => {
  it("submits the email and shows the sent state without leaking account existence", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PasswordRecoveryPanel mode="request" />);
    await user.type(screen.getByTestId("forgot-password-email"), "person@example.com");
    await user.click(screen.getByTestId("forgot-password-submit"));

    await waitFor(() => expect(screen.getByTestId("forgot-password-sent")).toBeInTheDocument());
    expect(screen.getByText(/person@example\.com/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/forgot-password",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "person@example.com" }) })
    );
    expect(mocks.capture).toHaveBeenCalledWith("password_reset_requested", expect.anything());
  });

  it("blocks submission while the provider cooldown is active", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "Too many reset requests.", retryAfter: 60 })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PasswordRecoveryPanel mode="request" />);
    await user.type(screen.getByTestId("forgot-password-email"), "person@example.com");
    await user.click(screen.getByTestId("forgot-password-submit"));

    await waitFor(() => expect(screen.getByText(/too many reset requests/i)).toBeInTheDocument());
    expect(screen.getByTestId("forgot-password-submit")).toBeDisabled();
  });
});

describe("PasswordRecoveryPanel reset mode", () => {
  it("posts a policy-valid password to the shared change-password endpoint and enters the app", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PasswordRecoveryPanel mode="reset" />);
    await user.type(screen.getByTestId("reset-password-input"), "crimson-harbor-77");
    await user.type(screen.getByTestId("reset-password-confirm"), "crimson-harbor-77");
    await user.click(screen.getByTestId("reset-password-submit"));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/password",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ password: "crimson-harbor-77" }) })
    );
    expect(mocks.capture).toHaveBeenCalledWith("password_reset_completed", expect.anything());
    expect(mocks.refreshAuthUser).toHaveBeenCalled();
  });

  it("keeps the submit button disabled until both fields match the policy", async () => {
    const user = userEvent.setup();
    render(<PasswordRecoveryPanel mode="reset" />);

    const submit = screen.getByTestId("reset-password-submit");
    expect(submit).toBeDisabled();

    await user.type(screen.getByTestId("reset-password-input"), "weak");
    expect(submit).toBeDisabled();

    await user.type(screen.getByTestId("reset-password-confirm"), "weak");
    expect(submit).toBeDisabled();
  });
});
