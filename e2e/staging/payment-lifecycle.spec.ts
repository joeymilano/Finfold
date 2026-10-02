import { expect, test } from "@playwright/test";
import { browserFetch } from "../helpers/browser-fetch";

test("signed payment lifecycle is idempotent and cleans up its disposable account", async ({
  page,
  browser
}) => {
  test.setTimeout(120_000);
  await page.goto("/workbench");

  const response = await browserFetch(page, "/api/admin/staging/payment-fixture", {
    method: "POST",
    body: {},
    timeoutMs: 90_000
  });
  expect(
    response.status,
    `payment fixture response: ${JSON.stringify(response.body)}`
  ).toBe(200);
  expect(response.body).toMatchObject({
    ok: true,
    checkout: { received: true },
    checkoutReplay: { received: true, duplicate: true },
    active: { received: true },
    activeReplay: { received: true, duplicate: true },
    canceled: { received: true },
    expired: { received: true },
    activeState: { plan: "pro", subscriptionStatus: "active" },
    canceledState: { plan: "free", subscriptionStatus: "canceled" },
    expiredState: { plan: "free", subscriptionStatus: "expired" },
    cleanup: true
  });

  const secondary = await browser.newContext({ storageState: "playwright/.auth/secondary.json" });
  try {
    const secondaryPage = await secondary.newPage();
    await secondaryPage.goto("/workbench");
    const forbidden = await browserFetch(
      secondaryPage,
      "/api/admin/staging/payment-fixture",
      { method: "POST", body: {} }
    );
    expect(forbidden.status).toBe(403);
  } finally {
    await secondary.close();
  }
});
