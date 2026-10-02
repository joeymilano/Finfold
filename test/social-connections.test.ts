import { describe, expect, it, vi } from "vitest";
import {
  selectSocialConnectionAccount,
  toSocialConnectionAccountSummary,
  toSocialConnectionSummary
} from "@/lib/social-connections";

describe("toSocialConnectionSummary", () => {
  it("returns an allow-listed connection shape and never exposes credentials", () => {
    const summary = toSocialConnectionSummary({
      id: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
      connector_id: "x",
      status: "connected",
      token_expires_at: "2026-08-05T10:00:00+00:00",
      granted_scopes: ["tweet.read", "tweet.write"],
      last_error_code: null,
      connected_at: "2026-08-05T09:00:00+00:00",
      updated_at: "2026-08-05T09:00:00+00:00",
      encrypted_access_token: "must-not-leak",
      encrypted_refresh_token: "must-not-leak"
    });

    expect(summary).toEqual({
      id: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
      connectorId: "x",
      status: "connected",
      tokenExpiresAt: "2026-08-05T10:00:00+00:00",
      grantedScopes: ["tweet.read", "tweet.write"],
      lastErrorCode: null,
      connectedAt: "2026-08-05T09:00:00+00:00",
      updatedAt: "2026-08-05T09:00:00+00:00"
    });
  });

  it("rejects an unknown connector instead of returning a malformed connection", () => {
    expect(() =>
      toSocialConnectionSummary({
        id: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
        connector_id: "not-a-platform",
        status: "connected",
        token_expires_at: null,
        granted_scopes: [],
        last_error_code: null,
        connected_at: null,
        updated_at: "2026-08-05T09:00:00+00:00"
      })
    ).toThrow();
  });

  it("returns only safe selected-account metadata", () => {
    expect(toSocialConnectionAccountSummary({
      id: "b2c85540-4316-4b0f-acf0-714a8dfc89ce",
      connection_id: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
      external_account_id: "2244994945",
      account_type: "profile",
      handle: "@XDevelopers",
      display_name: "X Developers",
      avatar_url: "https://pbs.twimg.com/profile_images/example.jpg",
      is_selected: true,
      updated_at: "2026-08-05T09:00:00+00:00",
      encrypted_access_token: "must-not-leak"
    })).toEqual({
      id: "b2c85540-4316-4b0f-acf0-714a8dfc89ce",
      connectionId: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
      externalAccountId: "2244994945",
      accountType: "profile",
      handle: "@XDevelopers",
      displayName: "X Developers",
      avatarUrl: "https://pbs.twimg.com/profile_images/example.jpg",
      isSelected: true,
      updatedAt: "2026-08-05T09:00:00+00:00"
    });
  });

  it("delegates account selection to the ownership-enforcing database RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: "b2c85540-4316-4b0f-acf0-714a8dfc89ce",
        connection_id: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
        external_account_id: "2244994945",
        account_type: "profile",
        handle: "@XDevelopers",
        display_name: "X Developers",
        avatar_url: null,
        is_selected: true,
        updated_at: "2026-08-05T09:00:00+00:00"
      },
      error: null
    });

    await expect(selectSocialConnectionAccount({ rpc } as never, {
      userId: "a1c85540-4316-4b0f-acf0-714a8dfc89ce",
      connectionId: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
      accountId: "b2c85540-4316-4b0f-acf0-714a8dfc89ce"
    })).resolves.toMatchObject({ isSelected: true });

    expect(rpc).toHaveBeenCalledWith("select_social_connection_account", {
      p_user_id: "a1c85540-4316-4b0f-acf0-714a8dfc89ce",
      p_connection_id: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
      p_account_id: "b2c85540-4316-4b0f-acf0-714a8dfc89ce"
    });
  });
});