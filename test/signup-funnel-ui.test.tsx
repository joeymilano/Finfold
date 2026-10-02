import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSplit } from "@/components/app-shell/AuthSplit";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  identify: vi.fn(),
  push: vi.fn()
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }) }));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "en" }));
vi.mock("@/lib/posthog", () => ({
  captureEvent: mocks.capture,
  identifyAnalyticsUser: mocks.identify
}));
vi.mock("motion/react", () => ({
  motion: new Proxy({}, { get: (_target, tag) => tag })
}));
vi.mock("@/components/app-shell/FishLogo", () => ({ FishLogo: () => null }));
vi.mock("@/components/ui/BorderBeam", () => ({ BorderBeam: () => null }));
vi.mock("@/components/theme/LocaleToggle", () => ({ LocaleToggle: () => null }));
vi.mock("@/components/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("signup funnel instrumentation", () => {
  it("captures page view, first interaction, submission, completion, and destination request", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: { id: "user-123" },
        session: { access_token: "redacted" },
        needsConfirmation: false
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthSplit mode="signup" returnTo="/dashboard" />);
    expect(screen.getByTestId("signup-value-points")).toHaveTextContent("50 free Credits monthly");
    expect(screen.getByTestId("signup-value-points")).toHaveTextContent("No credit card");
    expect(screen.getByRole("button", { name: /Create free workspace/i })).toBeInTheDocument();
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledWith("signup_page_viewed", expect.objectContaining({
      return_to: "/dashboard",
      locale: "en",
      signup_value_variant: "free_value_v1"
    })));

    await user.click(screen.getByTestId("auth-email"));
    await user.type(screen.getByTestId("auth-email"), "founder@example.com");
    await user.type(screen.getByTestId("auth-password"), "Growth123!");
    await user.click(screen.getByTestId("auth-submit"));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
    expect(mocks.capture).toHaveBeenCalledWith("signup_started", expect.objectContaining({
      auth_method: "email",
      trigger: "form_interaction",
      signup_value_variant: "free_value_v1"
    }));
    expect(mocks.capture).toHaveBeenCalledWith("signup_submitted", expect.objectContaining({ auth_method: "email" }));
    expect(mocks.capture).toHaveBeenCalledWith("signup_account_created", expect.objectContaining({ needs_confirmation: false }));
    expect(mocks.capture).toHaveBeenCalledWith("signup_completed", expect.objectContaining({ completion_stage: "signup_api" }));
    expect(mocks.capture).toHaveBeenCalledWith("signup_destination_requested", expect.objectContaining({ return_to: "/dashboard" }));
    expect(mocks.identify).toHaveBeenCalledWith({ id: "user-123", locale: "en" });
    const signupRequest = fetchMock.mock.calls.find(([url]) => url === "/api/auth/signup");
    const signupBody = JSON.parse(String(signupRequest?.[1]?.body));
    expect(signupBody).toMatchObject({
      next: "/dashboard",
      trafficClass: "qa"
    });
    expect(signupBody.signupFlowId).toMatch(/^[a-z0-9-]{8,80}$/i);
  });

  it("records client validation failures without sending credentials", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn());
    render(<AuthSplit mode="signup" returnTo="/operations/account-health" />);

    await waitFor(() => expect(mocks.capture).toHaveBeenCalledWith("signup_page_viewed", expect.any(Object)));
    await user.click(screen.getByTestId("auth-email"));
    await user.keyboard("{Enter}");

    await waitFor(() => expect(mocks.capture).toHaveBeenCalledWith("signup_failed", expect.objectContaining({
      auth_method: "email",
      return_to: "/operations/account-health",
      failure_stage: "client_validation",
      error_code: "missing_credentials"
    })));
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain("password");
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain("email.com");
  });

  it("prevents an immediate duplicate confirmation request after email signup", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: { id: "user-confirmation" },
        session: null,
        needsConfirmation: true
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthSplit mode="signup" returnTo="/dashboard" />);
    await user.type(screen.getByTestId("auth-email"), "founder@example.com");
    await user.type(screen.getByTestId("auth-password"), "Growth123!");
    await user.click(screen.getByTestId("auth-submit"));

    await waitFor(() => expect(
      screen.getByText(/there is no need to submit again within 60 seconds/i),
    ).toBeInTheDocument());
    const submit = screen.getByTestId("auth-submit");
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent("Email sent · 60s");
    await user.click(submit);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      mocks.capture.mock.calls.filter(([event]) => event === "signup_account_created"),
    ).toHaveLength(1);
    expect(mocks.capture).toHaveBeenCalledWith("signup_confirmation_required", expect.any(Object));
  });
});
