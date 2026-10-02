import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthorizationDetails: vi.fn(),
  approveAuthorization: vi.fn(),
  denyAuthorization: vi.fn(),
  capture: vi.fn()
}));

vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "en" }));
vi.mock("@/lib/posthog", () => ({ captureEvent: mocks.capture }));
vi.mock("@/lib/supabase-client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      oauth: {
        getAuthorizationDetails: mocks.getAuthorizationDetails,
        approveAuthorization: mocks.approveAuthorization,
        denyAuthorization: mocks.denyAuthorization
      }
    }
  })
}));

import { OAuthConsentClient } from "@/components/auth/OAuthConsentClient";

describe("Finfold OAuth consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthorizationDetails.mockResolvedValue({
      data: {
        authorization_id: "12345678-1234-4234-8234-123456789012",
        redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect",
        client: { id: "client-id", name: "ChatGPT", uri: "https://chatgpt.com", logo_uri: "" },
        user: { id: "user-id", email: "owner@example.test" },
        scope: "openid"
      },
      error: null
    });
  });

  it("states the exact access boundary before the user can approve", async () => {
    render(<OAuthConsentClient authorizationId="12345678-1234-4234-8234-123456789012" />);

    expect(await screen.findByRole("heading", { name: "Connect ChatGPT to Finfold?" })).toBeTruthy();
    expect(screen.getByAltText("Finfold")).toHaveAttribute("src", "/brand/favicon-tab-v2-96.png");
    expect(screen.getByTestId("oauth-redirect-host")).toHaveTextContent("chatgpt.com");
    expect(await screen.findByText("Create and read your Finfold content kits")).toBeTruthy();
    expect(screen.getByText("Confirm your Finfold identity")).toBeTruthy();
    expect(screen.getByText(/It cannot publish them or change connected social accounts/)).toBeTruthy();
    expect(screen.getByText(/Your Finfold password is never shared with the requesting app/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Allow and continue/ }).hasAttribute("disabled")).toBe(false);
    expect(mocks.capture).toHaveBeenCalledWith("plugin_oauth_started", expect.objectContaining({
      source: "chatgpt_plugin",
      requested_scope_count: 1
    }));
  });

  it("shows the real OAuth client instead of labeling every DCR client as ChatGPT", async () => {
    mocks.getAuthorizationDetails.mockResolvedValueOnce({
      data: {
        authorization_id: "12345678-1234-4234-8234-123456789012",
        redirect_uri: "https://partner.example/oauth/callback",
        client: { id: "partner-client", name: "Partner Workspace", uri: "https://partner.example", logo_uri: "" },
        user: { id: "user-id", email: "owner@example.test" },
        scope: "openid email"
      },
      error: null
    });

    render(<OAuthConsentClient authorizationId="12345678-1234-4234-8234-123456789012" />);

    expect(await screen.findByRole("heading", { name: "Connect Partner Workspace to Finfold?" })).toBeTruthy();
    expect(screen.queryByText(/Connect ChatGPT/)).toBeNull();
    expect(screen.getByTestId("oauth-redirect-host")).toHaveTextContent("partner.example");
    expect(screen.getByText("Share your Finfold email")).toBeTruthy();
    expect(mocks.capture).toHaveBeenCalledWith("plugin_oauth_started", expect.objectContaining({
      source: "oauth_client",
      requested_scope_count: 2
    }));
  });

  it("presents an expired request as a compact, recoverable state", async () => {
    mocks.getAuthorizationDetails.mockResolvedValueOnce({
      data: null,
      error: new Error("expired")
    });

    render(<OAuthConsentClient authorizationId="expired-authorization-request" />);

    expect(await screen.findByRole("heading", { name: "This connection link has expired" })).toBeTruthy();
    expect(screen.getByRole("alert")).toHaveTextContent("A new connection request is needed");
    expect(screen.getByRole("button", { name: "Go back and try again" })).toBeTruthy();
  });

  it("turns an authorization that expires before approval into the recoverable state", async () => {
    mocks.approveAuthorization.mockResolvedValueOnce({
      data: null,
      error: { code: "oauth_authorization_not_found", status: 404, message: "authorization not found" }
    });

    render(<OAuthConsentClient authorizationId="12345678-1234-4234-8234-123456789012" />);

    fireEvent.click(await screen.findByRole("button", { name: /Allow and continue/ }));

    expect(await screen.findByRole("heading", { name: "This connection link has expired" })).toBeTruthy();
    expect(screen.getByRole("alert")).toHaveTextContent("Return to ChatGPT and connect Finfold again");
    expect(screen.queryByRole("button", { name: /Allow and continue/ })).toBeNull();
  });
});
