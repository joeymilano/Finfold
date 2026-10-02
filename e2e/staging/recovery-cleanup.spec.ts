import { expect, test } from "@playwright/test";
import { browserFetch } from "../helpers/browser-fetch";

type PublicRun = {
  id: string;
  status: string;
  creditCost: number;
  creditsReserved: boolean;
  creditsRefunded: boolean;
  contentKitId: string | null;
};

type AuthUserResponse = { user?: { id?: string } | null };

const recoveryRunId = process.env.E2E_RECOVERY_RUN_ID?.trim();

test("recover and clean up one interrupted staging generation", async ({ page }) => {
  test.skip(!recoveryRunId, "Run only when E2E_RECOVERY_RUN_ID identifies a staging run.");
  test.setTimeout(120_000);
  if (!recoveryRunId) return;

  await page.goto("/workbench");
  const userResponse = await browserFetch(page, "/api/auth/user");
  const userId = (userResponse.body as AuthUserResponse).user?.id;
  expect(userId).toBeTruthy();
  if (!userId) throw new Error("Staging recovery user is unavailable.");

  const readRun = async (): Promise<PublicRun> => {
    const response = await browserFetch(page, `/api/generation-runs/${recoveryRunId}`);
    expect(response.status).toBe(200);
    const run = (response.body as { run?: PublicRun }).run;
    expect(run).toBeTruthy();
    if (!run) throw new Error("Interrupted staging run was not found.");
    return run;
  };

  let run = await readRun();
  if (!["succeeded", "partial_success", "failed", "cancelled"].includes(run.status)) {
    await expect
      .poll(
        async () => {
          const recovery = await browserFetch(
            page,
            `/api/generation-runs/${recoveryRunId}/recover`,
            { method: "POST" }
          );
          return recovery.status;
        },
        { timeout: 90_000, intervals: [5_000, 10_000] }
      )
      .toBe(200);
    run = await readRun();
  }

  expect(["succeeded", "partial_success", "failed", "cancelled"]).toContain(run.status);

  if (run.contentKitId) {
    const cleanup = await browserFetch(page, `/api/kits/${run.contentKitId}`, {
      method: "DELETE"
    });
    expect(cleanup.status).toBe(200);
  }

  if (run.creditsReserved && !run.creditsRefunded && run.creditCost > 0) {
    const restore = await browserFetch(page, "/api/admin/credits/reconcile", {
      method: "POST",
      body: {
        action: "adjust",
        userId,
        delta: run.creditCost,
        reason: "Staging interrupted-run Credits restoration",
        idempotencyKey: `staging-recovery-restore-${recoveryRunId}`
      }
    });
    expect(restore.status).toBe(200);
    expect(restore.body).toMatchObject({ ok: true });
  }
});
