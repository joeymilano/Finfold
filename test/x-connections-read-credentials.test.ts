import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSocialConnectionCredentials: vi.fn(),
  refreshSocialConnectionCredentials: vi.fn(),
  exchangeSocialOAuthRefreshToken: vi.fn(),
  encryptSecret: vi.fn(),
  tokenExpiresAt: vi.fn()
}));

vi.mock("@/lib/social-connections", () => ({
  getSocialConnectionCredentials: mocks.getSocialConnectionCredentials,
  refreshSocialConnectionCredentials: mocks.refreshSocialConnectionCredentials
}));
vi.mock("@/lib/social-oauth", () => ({
  exchangeSocialOAuthRefreshToken: mocks.exchangeSocialOAuthRefreshToken,
  getSocialOAuthProvider: vi.fn(() => ({ connectorId: "x" })),
  tokenExpiresAt: mocks.tokenExpiresAt
}));
vi.mock("@/lib/secret-encryption", () => ({ encryptSecret: mocks.encryptSecret }));

import { getActiveXReadCredentials } from "@/lib/x-connections";

const admin = {} as Parameters<typeof getActiveXReadCredentials>[0];
const userId = "a1c85540-4316-4b0f-acf0-714a8dfc89ce";
const connectionId = "c4d85540-4316-4b0f-acf0-714a8dfc89ce";

describe("getActiveXReadCredentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.encryptSecret.mockImplementation(async (value: string) => `enc:${value}`);
    mocks.refreshSocialConnectionCredentials.mockResolvedValue(undefined);
  });

  it("returns null when no connection exists", async () => {
    mocks.getSocialConnectionCredentials.mockResolvedValue(null);

    await expect(getActiveXReadCredentials(admin, userId, connectionId)).resolves.toBeNull();
    expect(mocks.getSocialConnectionCredentials).toHaveBeenCalledWith(admin, userId, "x", connectionId);
  });

  it("keeps a live token without touching the refresh grant", async () => {
    mocks.getSocialConnectionCredentials.mockResolvedValue({
      connectionId,
      accessToken: "live-token",
      refreshToken: "refresh-a",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      grantedScopes: ["users.read"]
    });

    await expect(getActiveXReadCredentials(admin, userId, connectionId)).resolves.toMatchObject({
      accessToken: "live-token",
      refreshToken: "refresh-a"
    });
    expect(mocks.exchangeSocialOAuthRefreshToken).not.toHaveBeenCalled();
    expect(mocks.refreshSocialConnectionCredentials).not.toHaveBeenCalled();
  });

  it("refreshes an expired token, persists the rotation, and does not require tweet.write", async () => {
    mocks.getSocialConnectionCredentials.mockResolvedValue({
      connectionId,
      accessToken: "dead-token",
      refreshToken: "refresh-a",
      tokenExpiresAt: new Date(Date.now() - 219 * 60 * 60 * 1_000).toISOString(),
      grantedScopes: ["users.read", "offline.access"]
    });
    mocks.exchangeSocialOAuthRefreshToken.mockResolvedValue({
      accessToken: "fresh-token",
      refreshToken: "refresh-b",
      expiresIn: 7_200,
      grantedScopes: ["users.read", "offline.access"]
    });
    mocks.tokenExpiresAt.mockReturnValue("2026-09-27T23:00:00.000Z");

    await expect(getActiveXReadCredentials(admin, userId, connectionId)).resolves.toMatchObject({
      accessToken: "fresh-token",
      refreshToken: "refresh-b",
      tokenExpiresAt: "2026-09-27T23:00:00.000Z"
    });
    expect(mocks.exchangeSocialOAuthRefreshToken).toHaveBeenCalledWith(
      { provider: expect.anything(), refreshToken: "refresh-a" },
      expect.any(Function)
    );
    expect(mocks.refreshSocialConnectionCredentials).toHaveBeenCalledWith(admin, {
      userId,
      connectorId: "x",
      connectionId,
      encryptedAccessToken: "enc:fresh-token",
      encryptedRefreshToken: "enc:refresh-b",
      tokenExpiresAt: "2026-09-27T23:00:00.000Z"
    });
  });

  it("propagates a rejected refresh token so callers can report it", async () => {
    mocks.getSocialConnectionCredentials.mockResolvedValue({
      connectionId,
      accessToken: "dead-token",
      refreshToken: "revoked-refresh",
      tokenExpiresAt: new Date(Date.now() - 219 * 60 * 60 * 1_000).toISOString(),
      grantedScopes: ["users.read"]
    });
    mocks.exchangeSocialOAuthRefreshToken.mockRejectedValue(new Error("The social platform rejected the refresh token."));

    await expect(getActiveXReadCredentials(admin, userId, connectionId)).rejects.toThrow(
      "The social platform rejected the refresh token."
    );
  });
});
