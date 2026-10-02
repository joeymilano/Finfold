import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const router = { replace: vi.fn(), refresh: vi.fn() };
let socialConnectionsPayload: unknown;

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/image", () => ({
  default: ({ fill: _fill, unoptimized: _unoptimized, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; unoptimized?: boolean }) => <img {...props} />
}));
vi.mock("@/hooks/useLocale", () => ({ useLocale: () => "en" }));
vi.mock("@/lib/supabase-client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) }
  })
}));

import SettingsPage from "@/app/(dashboard)/settings/page";
import { AuthUserProvider } from "@/components/auth/AuthUserProvider";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as Response);
}

function renderSettingsAt(path: string) {
  window.history.replaceState(null, "", path);
  return render(<AuthUserProvider><SettingsPage /></AuthUserProvider>);
}

describe("Settings social accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      switch (String(input)) {
        case "/api/auth/user":
          return jsonResponse({ user: { id: "user-1", email: "founder@finfold.example", plan: "free", avatarUrl: null } });
        case "/api/settings/integrations":
          return jsonResponse({ x: { connected: false, tokenTail: null } });
        case "/api/settings/social-connections":
          return jsonResponse(socialConnectionsPayload);
        default:
          return jsonResponse({ error: "Unexpected request" }, 404);
      }
    }));
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("opens on account security and deep-links sections through ?tab=", async () => {
    socialConnectionsPayload = { connections: [], oauthConnectors: { x: false } };
    renderSettingsAt("/settings");

    expect(await screen.findByRole("heading", { name: "Account Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account & Security" })).toHaveAttribute("aria-current", "true");
    expect(await screen.findByText("Change Email")).toBeInTheDocument();
    // Social content stays unmounted until its section opens.
    expect(screen.queryByText("X / Twitter")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Social Accounts" }));
    expect(await screen.findByText("X OAuth is not configured in this environment.")).toBeInTheDocument();
    expect(window.location.search).toContain("tab=social");
  });

  it("lands on the social section after a social OAuth callback", async () => {
    socialConnectionsPayload = { connections: [], oauthConnectors: { x: true } };
    renderSettingsAt("/settings?social_connection=x&social_status=connected");

    expect(await screen.findByText("X authorization completed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Social Accounts" })).toHaveAttribute("aria-current", "true");
  });

  it("hides the manual metrics card and shows a plain unavailable notice when X OAuth is off", async () => {
    socialConnectionsPayload = { connections: [], oauthConnectors: { x: false } };
    renderSettingsAt("/settings?tab=social");

    expect(await screen.findByText("X OAuth is not configured in this environment.")).toBeInTheDocument();
    expect(document.getElementById("social-accounts")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect X account" })).not.toBeInTheDocument();
    // Manual-URL metrics card is feature-flagged off (MANUAL_X_METRICS_ENABLED).
    expect(screen.queryByText("X Post Metrics (Manual URLs)")).not.toBeInTheDocument();
    expect(screen.queryByText("X 推文指标（手动 URL）")).not.toBeInTheDocument();
  });

  it("presents publishing as an approval-gated capability without adding an X publishing control", async () => {
    socialConnectionsPayload = {
      oauthConnectors: { x: true },
      connections: [{
        id: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
        connectorId: "x",
        status: "connected",
        accounts: [{
          id: "b2c85540-4316-4b0f-acf0-714a8dfc89ce",
          connectionId: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
          externalAccountId: "2244994945",
          accountType: "profile",
          handle: "@XDevelopers",
          displayName: "X Developers",
          avatarUrl: null,
          isSelected: true,
          updatedAt: "2026-08-05T09:00:00+00:00"
        }]
      }]
    };
    renderSettingsAt("/settings?tab=social");

    const profile = await screen.findByRole("button", { name: /X Developers/ });
    expect(profile).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sync profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect Finfold" })).toBeInTheDocument();
    expect(document.getElementById("social-accounts")).toHaveTextContent(
      "Finfold can publish on supported platforms after one approval"
    );
    expect(screen.queryByRole("button", { name: /publish/i })).not.toBeInTheDocument();
  });

  it("shows WeChat publishing and aggregate analytics capabilities", async () => {
    socialConnectionsPayload = {
      oauthConnectors: { x: false, linkedin: false, wechat: true },
      connections: [{
        id: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
        connectorId: "wechat",
        status: "connected",
        grantedScopes: ["wechat_authorized", "wechat_func_2"],
        accounts: [{
          id: "b2c85540-4316-4b0f-acf0-714a8dfc89ce",
          connectionId: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
          externalAccountId: "wx-authorizer",
          accountType: "page",
          handle: "gh_finfold",
          displayName: "Finfold Official",
          avatarUrl: null,
          isSelected: true,
          updatedAt: "2026-08-25T09:00:00+00:00"
        }]
      }]
    };
    renderSettingsAt("/settings?tab=social");

    expect(await screen.findByText("Finfold Official")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync month-to-date user data" })).toBeInTheDocument();
    expect(document.getElementById("social-accounts")).toHaveTextContent(
      "Publishing, scheduling, and aggregate follower analytics"
    );
  });

  it("renders multiple independent Instagram grants and keeps publishing unavailable", async () => {
    socialConnectionsPayload = {
      oauthConnectors: { x: false, linkedin: false, instagram: true, wechat: false },
      connections: [
        {
          id: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
          connectorId: "instagram",
          status: "connected",
          grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"],
          accounts: [{
            id: "b2c85540-4316-4b0f-acf0-714a8dfc89ce",
            connectionId: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
            externalAccountId: "17841400000000001",
            accountType: "profile",
            handle: "@brand_one",
            displayName: "Brand One",
            avatarUrl: null,
            isSelected: true,
            updatedAt: "2026-08-26T09:00:00+00:00"
          }]
        },
        {
          id: "e1c85540-4316-4b0f-acf0-714a8dfc89ce",
          connectorId: "instagram",
          status: "connected",
          grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"],
          accounts: [{
            id: "c2c85540-4316-4b0f-acf0-714a8dfc89ce",
            connectionId: "e1c85540-4316-4b0f-acf0-714a8dfc89ce",
            externalAccountId: "17841400000000002",
            accountType: "profile",
            handle: "@brand_two",
            displayName: "Brand Two",
            avatarUrl: null,
            isSelected: true,
            updatedAt: "2026-08-26T09:00:00+00:00"
          }]
        }
      ]
    };
    renderSettingsAt("/settings?tab=social");

    expect(await screen.findByText("Brand One")).toBeInTheDocument();
    expect(screen.getByText("Brand Two")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect another" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Disconnect Finfold" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /publish/i })).not.toBeInTheDocument();
  });
});
