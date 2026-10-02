import { expect, test } from "@playwright/test";
import type { ContentKit } from "../../lib/content-schema";
import type { PublicGenerationRun } from "../../lib/generation-run-client";
import { computeKitCost } from "../../lib/payment/types";
import { browserFetch } from "../helpers/browser-fetch";

type AuthUserResponse = { user?: { id?: string } | null };
type EntitlementResponse = { authenticated?: boolean; available?: number };
type AdjustmentResponse = { ok?: boolean; outcome?: string };

test("generate once, recover after refresh, edit, publish, and enforce tenant isolation", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const marker = `E2E staging ${new Date().toISOString()} ${crypto.randomUUID().slice(0, 8)}`;
  const ideaText = `${marker}. Finfold now keeps content generation durable across Worker restarts and prevents duplicate credit charges.`;
  const fixtureId = crypto.randomUUID();
  let primaryUserId: string | undefined;
  let temporaryCreditDelta = 0;
  let generationRunId: string | undefined;
  let kitId: string | undefined;
  let outputId: string | undefined;

  try {
    await page.goto("/workbench");
    const userResponse = await browserFetch(page, "/api/auth/user");
    expect(userResponse.status).toBe(200);
    primaryUserId = (userResponse.body as AuthUserResponse).user?.id;
    expect(primaryUserId).toBeTruthy();
    if (!primaryUserId) throw new Error("Primary staging user is unavailable.");

    const entitlementResponse = await browserFetch(page, "/api/entitlements/check", {
      method: "POST"
    });
    expect(entitlementResponse.status).toBe(200);
    const entitlement = entitlementResponse.body as EntitlementResponse;
    expect(entitlement.authenticated).toBe(true);
    expect(entitlement.available).toEqual(expect.any(Number));
    const requiredGenerationCredits = computeKitCost(1);
    temporaryCreditDelta = Math.max(
      0,
      requiredGenerationCredits - Math.trunc(entitlement.available ?? 0)
    );
    if (temporaryCreditDelta > 0) {
      const credit = await browserFetch(page, "/api/admin/credits/reconcile", {
        method: "POST",
        body: {
          action: "adjust",
          userId: primaryUserId,
          delta: temporaryCreditDelta,
          reason: "Staging E2E temporary generation fixture credit",
          idempotencyKey: `staging-critical-credit-${fixtureId}`
        }
      });
      expect(credit.status).toBe(200);
      expect(credit.body as AdjustmentResponse).toMatchObject({
        ok: true,
        outcome: "applied"
      });
    }

    await page.getByTestId("workbench-source-input").fill(ideaText);

    for (const platform of ["xiaohongshu", "linkedin"]) {
      const toggle = page.locator(`[data-testid="platform-${platform}"]:visible`);
      if ((await toggle.getAttribute("aria-pressed")) === "true") await toggle.click();
    }

    const generate = page.getByTestId("generate-kit-desktop");
    await expect(generate).toBeEnabled();
    const generateResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/generate" &&
        response.request().method() === "POST",
      { timeout: 60_000 }
    );
    await generate.click();
    await expect(page.getByTestId("workbench-source-input")).toBeDisabled();
    const generateResponse = await generateResponsePromise;
    expect(generateResponse.ok()).toBe(true);
    expect(await generateResponse.finished()).toBeNull();
    await expect.poll(async () => {
      generationRunId = await page.evaluate((currentIdeaText) => {
        const raw = window.localStorage.getItem("finfold-active-generation-v1");
        if (!raw) return undefined;
        try {
          const pending = JSON.parse(raw) as {
            runId?: unknown;
            input?: { ideaText?: unknown };
          };
          return (
            typeof pending.runId === "string" &&
            pending.input?.ideaText === currentIdeaText
          ) ? pending.runId : undefined;
        } catch {
          return undefined;
        }
      }, ideaText);
      return generationRunId;
    }, {
      message: "the current generation should receive a durable server run before refresh",
      timeout: 30_000
    }).toEqual(expect.any(String));
    if (!generationRunId) throw new Error("The current generation did not receive a durable run ID.");

    // Reload while the durable run may still be queued or processing. The
    // restored output is the assertion; SSE is intentionally not the source
    // of truth for this test.
    await page.reload();
    await expect.poll(async () => {
      const runResponse = await browserFetch(page, `/api/generation-runs/${generationRunId}`);
      if (runResponse.status !== 200) return false;
      const run = (runResponse.body as { run?: PublicGenerationRun }).run;
      if (!run) return false;
      if (run.status === "failed" || run.status === "cancelled") {
        throw new Error(
          `Generation run ${run.status}: ${run.error?.code ?? "unknown"} ${run.error?.message ?? ""}`.trim()
        );
      }
      if (
        (run.status !== "succeeded" && run.status !== "partial_success") ||
        !run.contentKitId
      ) return false;

      const kitResponse = await browserFetch(page, `/api/kits/${run.contentKitId}`);
      if (kitResponse.status !== 200) return false;
      const createdKit = (kitResponse.body as { kit?: ContentKit }).kit;
      if (!createdKit || !createdKit.ideaText.startsWith(marker)) return false;
      kitId = createdKit.id;
      outputId = createdKit?.outputs.find((item) => item.platform === "x")?.id;
      return Boolean(kitId && outputId);
    }, {
      message: "the current generation should persist its kit and X output",
      timeout: 180_000
    }).toBe(true);
    if (!kitId || !outputId) throw new Error("The current generation did not persist a complete kit.");

    await page.reload();
    await expect(page.getByTestId("workbench-source-input")).toHaveValue(ideaText);
    const output = page.getByTestId("output-card-x");
    await expect(output).toBeVisible({ timeout: 180_000 });

    await output.getByTestId("edit-output-x").click();
    const editor = output.getByTestId("output-editor-x");
    await editor.fill(`${await editor.inputValue()}\n\n${marker} edited`);
    await output.getByTestId("save-output-x").click();
    await expect(output.getByText(/已编辑|Edited/)).toBeVisible();

    await output.getByTestId("mark-published-x").click();
    await expect(output.getByText(/已发布|Published/, { exact: true }).first()).toBeVisible();

    const secondary = await browser.newContext({ storageState: "playwright/.auth/secondary.json" });
    try {
      const secondaryPage = await secondary.newPage();
      await secondaryPage.goto("/workbench");
      const foreignRead = await browserFetch(secondaryPage, `/api/kits/${kitId}`);
      expect(foreignRead.status).toBe(404);
      const foreignUpdate = await browserFetch(
        secondaryPage,
        `/api/kits/${kitId}/outputs/${outputId}`,
        { method: "PUT", body: { publishStatus: "posted" } }
      );
      expect(foreignUpdate.status).toBe(404);
      const foreignDelete = await browserFetch(secondaryPage, `/api/kits/${kitId}`, {
        method: "DELETE"
      });
      expect(foreignDelete.status).toBe(200);
      const ownerReadAfterForeignDelete = await browserFetch(page, `/api/kits/${kitId}`);
      expect(ownerReadAfterForeignDelete.status).toBe(200);
    } finally {
      await secondary.close();
    }
  } finally {
    if (kitId) await browserFetch(page, `/api/kits/${kitId}`, { method: "DELETE" });
    if (primaryUserId && temporaryCreditDelta > 0) {
      const entitlementResponse = await browserFetch(page, "/api/entitlements/check", {
        method: "POST"
      });
      const available = Math.max(
        0,
        Math.trunc((entitlementResponse.body as EntitlementResponse).available ?? 0)
      );
      const unusedFixtureCredits = Math.min(temporaryCreditDelta, available);
      if (unusedFixtureCredits > 0) {
        const offset = await browserFetch(page, "/api/admin/credits/reconcile", {
          method: "POST",
          body: {
            action: "adjust",
            userId: primaryUserId,
            delta: -unusedFixtureCredits,
            reason: "Staging E2E temporary generation fixture offset",
            idempotencyKey: `staging-critical-offset-${fixtureId}`
          }
        });
        expect(offset.status).toBe(200);
        expect(offset.body as AdjustmentResponse).toMatchObject({
          ok: true,
          outcome: "applied"
        });
      }
    }
  }
});
