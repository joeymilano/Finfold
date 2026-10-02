import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceApiRateLimit: vi.fn(),
  getCurrentUserId: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  syncSocialConnectionAccounts: vi.fn(),
  selectSocialConnectionAccount: vi.fn(),
  listSocialConnectionsWithAccounts: vi.fn(),
  getActiveXReadCredentials: vi.fn()
}));

vi.mock("@/lib/api-rate-limit", () => ({ enforceApiRateLimit: mocks.enforceApiRateLimit }));
vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));
vi.mock("@/lib/social-connections", () => ({
  syncSocialConnectionAccounts: mocks.syncSocialConnectionAccounts,
  selectSocialConnectionAccount: mocks.selectSocialConnectionAccount,
  listSocialConnectionsWithAccounts: mocks.listSocialConnectionsWithAccounts
}));
vi.mock("@/lib/x-connections", () => ({
  getActiveXReadCredentials: mocks.getActiveXReadCredentials
}));

import { PATCH as selectAccount } from "@/app/api/settings/social-connections/[connectorId]/accounts/[accountId]/route";
import { POST as refreshAccounts } from "@/app/api/settings/social-connections/[connectorId]/accounts/refresh/route";

const account = {
  id: "b2c85540-4316-4b0f-acf0-714a8dfc89ce",
  connectionId: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
  externalAccountId: "2244994945",
  accountType: "profile",
  handle: "@XDevelopers",
  displayName: "X Developers",
  avatarUrl: null,
  isSelected: true,
  updatedAt: "2026-08-05T09:00:00+00:00"
};

describe("social connection account routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("X_OAUTH_ENABLED", "true");
    vi.stubEnv("X_OAUTH_CLIENT_ID", "x-client-id");
    vi.stubEnv("X_OAUTH_CLIENT_SECRET", "x-client-secret");
    mocks.enforceApiRateLimit.mockReturnValue(null);
    mocks.getCurrentUserId.mockResolvedValue("a1c85540-4316-4b0f-acf0-714a8dfc89ce");
    mocks.createSupabaseAdminClient.mockReturnValue({ marker: "admin" });
    mocks.getActiveXReadCredentials.mockResolvedValue({ accessToken: "server-held-token" });
    mocks.listSocialConnectionsWithAccounts.mockResolvedValue([{
      id: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
      connectorId: "x",
      status: "connected",
      accounts: [account]
    }]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("synchronizes an authenticated X profile without accepting a browser token", async () => {
    mocks.syncSocialConnectionAccounts.mockResolvedValue([account]);

    const response = await refreshAccounts(
      new Request("https://finfold.example/api/settings/social-connections/x/accounts/refresh", {
        method: "POST",
        body: JSON.stringify({ connectionId: "d1c85540-4316-4b0f-acf0-714a8dfc89ce" })
      }),
      { params: Promise.resolve({ connectorId: "x" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accounts: [account] });
    expect(mocks.getActiveXReadCredentials).toHaveBeenCalledWith(
      { marker: "admin" },
      "a1c85540-4316-4b0f-acf0-714a8dfc89ce",
      "d1c85540-4316-4b0f-acf0-714a8dfc89ce"
    );
    expect(mocks.syncSocialConnectionAccounts).toHaveBeenCalledWith(
      { marker: "admin" },
      "a1c85540-4316-4b0f-acf0-714a8dfc89ce",
      "x",
      "d1c85540-4316-4b0f-acf0-714a8dfc89ce"
    );
  });

  it("selects an account through the server-only ownership check", async () => {
    mocks.selectSocialConnectionAccount.mockResolvedValue(account);

    const response = await selectAccount(
      new Request("https://finfold.example/api/settings/social-connections/x/accounts/b2c85540-4316-4b0f-acf0-714a8dfc89ce", {
        method: "PATCH",
        body: JSON.stringify({ connectionId: "d1c85540-4316-4b0f-acf0-714a8dfc89ce" })
      }),
      { params: Promise.resolve({ connectorId: "x", accountId: "b2c85540-4316-4b0f-acf0-714a8dfc89ce" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ account });
    expect(mocks.selectSocialConnectionAccount).toHaveBeenCalledWith(
      { marker: "admin" },
      expect.objectContaining({
        userId: "a1c85540-4316-4b0f-acf0-714a8dfc89ce",
        connectionId: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
        accountId: "b2c85540-4316-4b0f-acf0-714a8dfc89ce"
      })
    );
  });

  it("fails closed when X OAuth is not configured", async () => {
    vi.stubEnv("X_OAUTH_ENABLED", "false");

    const response = await refreshAccounts(
      new Request("https://finfold.example/api/settings/social-connections/x/accounts/refresh", {
        method: "POST",
        body: JSON.stringify({ connectionId: "d1c85540-4316-4b0f-acf0-714a8dfc89ce" })
      }),
      { params: Promise.resolve({ connectorId: "x" }) }
    );

    expect(response.status).toBe(503);
    expect(mocks.syncSocialConnectionAccounts).not.toHaveBeenCalled();
  });
});
