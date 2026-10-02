import { describe, expect, it } from "vitest";
import { pickSocialSyncAccounts } from "@/lib/social-performance-sync";
import type { SocialConnectionAccountSummary } from "@/lib/social-connections";

function account(id: string, overrides: Partial<SocialConnectionAccountSummary> = {}): SocialConnectionAccountSummary {
  return {
    id,
    connectionId: "d1c85540-4316-4b0f-acf0-714a8dfc89ce",
    externalAccountId: `ext-${id}`,
    accountType: "organization",
    handle: null,
    displayName: `Account ${id}`,
    avatarUrl: null,
    isSelected: false,
    updatedAt: "2026-09-09T00:00:00.000Z",
    ...overrides
  };
}

describe("pickSocialSyncAccounts", () => {
  it("keeps the historical default of exactly the selected account when no ids are requested", () => {
    const accounts = [
      account("11111111-1111-4111-8111-111111111111"),
      account("22222222-2222-4222-8222-222222222222", { isSelected: true }),
      account("33333333-3333-4333-8333-333333333333")
    ];

    const { targets, missingAccountIds } = pickSocialSyncAccounts(accounts);

    expect(targets.map((target) => target.id)).toEqual(["22222222-2222-4222-8222-222222222222"]);
    expect(missingAccountIds).toEqual([]);
  });

  it("falls back to the first account when none is selected", () => {
    const accounts = [account("11111111-1111-4111-8111-111111111111"), account("22222222-2222-4222-8222-222222222222")];

    const { targets } = pickSocialSyncAccounts(accounts);

    expect(targets.map((target) => target.id)).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  it("covers every requested matrix account regardless of the selected flag", () => {
    const accounts = [
      account("11111111-1111-4111-8111-111111111111"),
      account("22222222-2222-4222-8222-222222222222", { isSelected: true }),
      account("33333333-3333-4333-8333-333333333333")
    ];

    const { targets, missingAccountIds } = pickSocialSyncAccounts(accounts, [
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333"
    ]);

    expect(targets.map((target) => target.id)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333"
    ]);
    expect(missingAccountIds).toEqual([]);
  });

  it("reports ids that do not belong to the connection instead of silently dropping them", () => {
    const accounts = [account("11111111-1111-4111-8111-111111111111")];

    const { targets, missingAccountIds } = pickSocialSyncAccounts(accounts, [
      "11111111-1111-4111-8111-111111111111",
      "99999999-9999-4999-8999-999999999999"
    ]);

    expect(targets.map((target) => target.id)).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(missingAccountIds).toEqual(["99999999-9999-4999-8999-999999999999"]);
  });

  it("returns no targets for an accountless connection", () => {
    const { targets, missingAccountIds } = pickSocialSyncAccounts([]);

    expect(targets).toEqual([]);
    expect(missingAccountIds).toEqual([]);
  });
});
