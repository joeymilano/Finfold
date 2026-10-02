import { expect, test } from "@playwright/test";
import type { ContentKit } from "../../lib/content-schema";
import { browserFetch } from "../helpers/browser-fetch";

const faultModes = [
  "provider_timeout_once",
  "terminal_provider_failure",
  "consumer_interruption_once",
  "duplicate_queue_delivery",
  "partial_platform_failure"
] as const;

type FaultMode = (typeof faultModes)[number];

type PublicRun = {
  id: string;
  status: string;
  attemptCount: number;
  platformCount: number;
  creditCost: number;
  creditsReserved: boolean;
  creditsRefunded: boolean;
  contentKitId: string | null;
  error: { code?: string; retryable?: boolean } | null;
};

type EntitlementResponse = { authenticated?: boolean; available?: number };
type AuthUserResponse = { user?: { id?: string } | null };

const configuredMode = process.env.E2E_FAULT_MODE?.trim();
const faultMode = faultModes.find((mode) => mode === configuredMode);

if (configuredMode && configuredMode !== "none" && !faultMode) {
  throw new Error(`Unsupported E2E_FAULT_MODE: ${configuredMode}`);
}

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
      // Ignore non-JSON SSE events and keep the durable run identifier only.
    }
  }
  return undefined;
}

function expectedStatus(mode: FaultMode): "failed" | "partial_success" | "succeeded" {
  if (mode === "terminal_provider_failure") return "failed";
  if (mode === "partial_platform_failure") return "partial_success";
  return "succeeded";
}

test("staging fault mode reaches the expected durable and billing state", async ({ page }) => {
  test.skip(!faultMode, "Run only when E2E_FAULT_MODE selects a deployed staging fault.");
  test.setTimeout(300_000);
  if (!faultMode) return;

  const fixtureId = crypto.randomUUID();
  const marker = `E2E fault ${faultMode} ${fixtureId}`;
  const platforms = faultMode === "partial_platform_failure" ? ["x", "linkedin"] : ["x"];
  let runId: string | undefined;
  let latestRun: PublicRun | undefined;
  let startingCredits: number | undefined;
  let userId: string | undefined;

  await page.goto("/workbench");
  const userResponse = await browserFetch(page, "/api/auth/user");
  userId = (userResponse.body as AuthUserResponse).user?.id;
  expect(userId).toBeTruthy();

  const entitlement = await browserFetch(page, "/api/entitlements/check", {
    method: "POST"
  });
  expect(entitlement.status).toBe(200);
  startingCredits = (entitlement.body as EntitlementResponse).available;
  expect(startingCredits).toEqual(expect.any(Number));

  try {
    const generation = await browserFetch(page, "/api/generate", {
      method: "POST",
      idempotencyKey: `staging-fault-${faultMode}-${fixtureId}`,
      body: {
        ideaText: `${marker}. Verify durable recovery and exactly-once Credits behavior in isolated staging.`,
        goal: "product-launch",
        persona: "indie-builder",
        platforms,
        mediaAssets: [],
        language: "en",
        customRules: []
      }
    });
    expect(generation.status).toBe(200);
    runId = runIdFromSse(generation.body);
    expect(runId).toBeTruthy();
    if (!runId) throw new Error("Fault-mode generation run was not created.");

    await expect
      .poll(
        async () => {
          const response = await browserFetch(page, `/api/generation-runs/${runId}`);
          expect(response.status).toBe(200);
          latestRun = (response.body as { run?: PublicRun }).run;
          return latestRun?.status;
        },
        { timeout: 240_000, intervals: [1_000, 2_000, 5_000] }
      )
      .toBe(expectedStatus(faultMode));

    expect(latestRun).toBeTruthy();
    if (!latestRun) throw new Error("Fault-mode generation run disappeared.");
    expect(latestRun.platformCount).toBe(platforms.length);
    expect(latestRun.creditsReserved).toBe(true);
    expect(latestRun.creditCost).toBeGreaterThan(0);

    if (faultMode === "terminal_provider_failure") {
      expect(latestRun).toMatchObject({
        status: "failed",
        attemptCount: 1,
        creditsRefunded: true,
        contentKitId: null,
        error: { code: "generation_failed", retryable: false }
      });
    } else {
      expect(latestRun.creditsRefunded).toBe(false);
      expect(latestRun.contentKitId).toBeTruthy();
      expect(latestRun.attemptCount).toBe(
        faultMode === "provider_timeout_once" || faultMode === "consumer_interruption_once"
          ? 2
          : 1
      );

      const kitResponse = await browserFetch(page, `/api/kits/${latestRun.contentKitId}`);
      expect(kitResponse.status).toBe(200);
      const kit = (kitResponse.body as { kit?: ContentKit }).kit;
      expect(kit?.ideaText.startsWith(marker)).toBe(true);
      expect(kit?.outputs).toHaveLength(
        faultMode === "partial_platform_failure" ? platforms.length - 1 : platforms.length
      );

      if (faultMode === "partial_platform_failure") {
        expect(latestRun.error?.code).toBe("partial_platform_failure");
      }
      if (faultMode === "duplicate_queue_delivery") {
        const duplicate = await browserFetch(page, "/api/generate", {
          method: "POST",
          idempotencyKey: `staging-fault-${faultMode}-${fixtureId}`,
          body: {
            ideaText: `${marker}. Verify durable recovery and exactly-once Credits behavior in isolated staging.`,
            goal: "product-launch",
            persona: "indie-builder",
            platforms,
            mediaAssets: [],
            language: "en",
            customRules: []
          }
        });
        expect(duplicate.status).toBe(200);
        expect(runIdFromSse(duplicate.body)).toBe(runId);
      }
    }
  } finally {
    if (latestRun?.contentKitId) {
      const cleanup = await browserFetch(page, `/api/kits/${latestRun.contentKitId}`, {
        method: "DELETE"
      });
      expect(cleanup.status).toBe(200);
    }

    if (
      userId &&
      latestRun?.creditsReserved &&
      !latestRun.creditsRefunded &&
      latestRun.creditCost > 0
    ) {
      const restore = await browserFetch(page, "/api/admin/credits/reconcile", {
        method: "POST",
        body: {
          action: "adjust",
          userId,
          delta: latestRun.creditCost,
          reason: `Staging E2E ${faultMode} Credits restoration`,
          idempotencyKey: `staging-fault-restore-${fixtureId}`
        }
      });
      expect(restore.status).toBe(200);
      expect(restore.body).toMatchObject({ ok: true, outcome: "applied" });
    }

    if (startingCredits !== undefined) {
      const restored = await browserFetch(page, "/api/entitlements/check", {
        method: "POST"
      });
      expect((restored.body as EntitlementResponse).available).toBe(startingCredits);
    }
  }
});
