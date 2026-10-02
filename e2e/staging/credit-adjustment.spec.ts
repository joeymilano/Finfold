import { expect, test } from "@playwright/test";
import { browserFetch } from "../helpers/browser-fetch";

type AuthUserResponse = { user?: { id?: string } | null };
type AdjustmentResponse = {
  ok?: boolean;
  outcome?: string;
};
type ReconciliationResponse = {
  ok?: boolean;
  reconciliationRunId?: string;
  discrepancyUsers?: number;
  issueCount?: number;
};

test("admin adjustments stay append-only, idempotent, and balanced", async ({ page, browser }) => {
  const secondary = await browser.newContext({ storageState: "playwright/.auth/secondary.json" });
  try {
    const secondaryPage = await secondary.newPage();
    await secondaryPage.goto("/workbench");
    const userResponse = await browserFetch(secondaryPage, "/api/auth/user");
    expect(userResponse.status).toBe(200);
    const targetUserId = (userResponse.body as AuthUserResponse).user?.id;
    expect(targetUserId).toBeTruthy();
    if (!targetUserId) throw new Error("Secondary staging user is unavailable");

    await page.goto("/workbench");
    const common = {
      action: "adjust",
      userId: targetUserId,
      relatedGenerationRunId: null,
      relatedPurchaseId: null
    };
    const creditBody = {
      ...common,
      delta: 1,
      reason: "Staging E2E append-only adjustment credit",
      idempotencyKey: `staging-e2e-adjustment-credit-${targetUserId}`
    };
    const offsetBody = {
      ...common,
      delta: -1,
      reason: "Staging E2E append-only adjustment offset",
      idempotencyKey: `staging-e2e-adjustment-offset-${targetUserId}`
    };

    const credit = await browserFetch(page, "/api/admin/credits/reconcile", {
      method: "POST",
      body: creditBody
    });
    expect(credit.status).toBe(200);
    expect(["applied", "duplicate"]).toContain((credit.body as AdjustmentResponse).outcome);

    const replay = await browserFetch(page, "/api/admin/credits/reconcile", {
      method: "POST",
      body: creditBody
    });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ ok: true, outcome: "duplicate" });

    const offset = await browserFetch(page, "/api/admin/credits/reconcile", {
      method: "POST",
      body: offsetBody
    });
    expect(offset.status).toBe(200);
    expect(["applied", "duplicate"]).toContain((offset.body as AdjustmentResponse).outcome);

    const run = await browserFetch(page, "/api/admin/credits/reconcile", {
      method: "POST",
      body: { action: "run" }
    });
    expect(run.status).toBe(200);
    expect(run.body as ReconciliationResponse).toMatchObject({
      ok: true,
      reconciliationRunId: expect.any(String),
      discrepancyUsers: 0,
      issueCount: 0
    });
  } finally {
    await secondary.close();
  }
});
