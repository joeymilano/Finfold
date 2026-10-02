import { expect, test } from "@playwright/test";
import { browserFetch } from "../helpers/browser-fetch";

type AuthUserResponse = { user?: { id?: string } | null };
type EntitlementResponse = { authenticated?: boolean; available?: number };
type GenerationRunResponse = {
  run?: {
    status?: string;
    error?: { code?: string } | null;
  };
};

function runIdFromSse(body: unknown): string | undefined {
  if (typeof body !== "string") return undefined;
  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      const payload = JSON.parse(line.slice(6)) as {
        run?: { id?: string };
        generationRunId?: string;
      };
      if (payload.run?.id) return payload.run.id;
      if (payload.generationRunId) return payload.generationRunId;
    } catch {
      // Ignore non-JSON SSE data and keep looking for the durable run event.
    }
  }
  return undefined;
}

test("insufficient Credits fail before provider execution and the fixture restores balance", async ({
  page,
  browser
}) => {
  test.setTimeout(120_000);
  const secondary = await browser.newContext({ storageState: "playwright/.auth/secondary.json" });
  let targetUserId: string | undefined;
  let drainedCredits = 0;
  const fixtureId = crypto.randomUUID();

  try {
    const secondaryPage = await secondary.newPage();
    await secondaryPage.goto("/workbench");
    const userResponse = await browserFetch(secondaryPage, "/api/auth/user");
    targetUserId = (userResponse.body as AuthUserResponse).user?.id;
    expect(targetUserId).toBeTruthy();
    if (!targetUserId) throw new Error("Secondary staging user is unavailable");

    const entitlement = await browserFetch(secondaryPage, "/api/entitlements/check", {
      method: "POST"
    });
    expect(entitlement.status).toBe(200);
    const allowance = entitlement.body as EntitlementResponse;
    expect(allowance.authenticated).toBe(true);
    expect(allowance.available).toEqual(expect.any(Number));
    drainedCredits = Math.max(0, Math.trunc(allowance.available ?? 0));

    await page.goto("/workbench");
    if (drainedCredits > 0) {
      const drain = await browserFetch(page, "/api/admin/credits/reconcile", {
        method: "POST",
        body: {
          action: "adjust",
          userId: targetUserId,
          delta: -drainedCredits,
          reason: "Staging E2E temporary low-credit fixture drain",
          idempotencyKey: `staging-low-credit-drain-${fixtureId}`
        }
      });
      expect(drain.status).toBe(200);
      expect(drain.body).toMatchObject({ ok: true, outcome: "applied", available: 0 });
    }

    const generation = await browserFetch(secondaryPage, "/api/generate", {
      method: "POST",
      idempotencyKey: `staging-low-credit-generate-${fixtureId}`,
      body: {
        ideaText:
          "This staging-only request verifies that empty Credits stop before any model provider call.",
        goal: "product-launch",
        persona: "indie-builder",
        platforms: ["x"],
        mediaAssets: [],
        language: "en",
        customRules: []
      }
    });
    expect(generation.status).toBe(200);
    const runId = runIdFromSse(generation.body);
    expect(runId).toBeTruthy();
    if (!runId) throw new Error("Durable low-credit generation run was not created");

    await expect
      .poll(
        async () => {
          const response = await browserFetch(secondaryPage, `/api/generation-runs/${runId}`);
          const run = (response.body as GenerationRunResponse).run;
          return { status: run?.status, errorCode: run?.error?.code };
        },
        { timeout: 90_000, intervals: [500, 1_000, 2_000] }
      )
      .toEqual({ status: "failed", errorCode: "insufficient_credits" });
  } finally {
    if (targetUserId && drainedCredits > 0) {
      const restore = await browserFetch(page, "/api/admin/credits/reconcile", {
        method: "POST",
        body: {
          action: "adjust",
          userId: targetUserId,
          delta: drainedCredits,
          reason: "Staging E2E low-credit fixture balance restoration",
          idempotencyKey: `staging-low-credit-restore-${fixtureId}`
        }
      });
      expect(restore.status).toBe(200);
      expect(restore.body).toMatchObject({ ok: true, outcome: "applied" });
    }
    await secondary.close();
  }
});
