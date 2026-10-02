import { expect, test } from "@playwright/test";

test("public health and version routes are reachable", async ({ request }) => {
  const health = await request.get("/api/health/ready");
  const target = process.env.PLAYWRIGHT_BASE_URL;
  const isRemoteTarget = Boolean(target && !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(target));
  if (isRemoteTarget) {
    expect(health.status()).toBe(200);
  } else {
    // A local checkout without production-only secrets is expected to report
    // not-ready. The important smoke assertion is that the route exists and
    // answers with the explicit readiness contract instead of 404/HTML.
    expect([200, 503]).toContain(health.status());
    await expect(health.json()).resolves.toMatchObject({ status: health.status() === 200 ? "ready" : "degraded" });
  }

  const version = await request.get("/api/version");
  expect(version.status()).toBe(200);
  await expect(version.json()).resolves.toMatchObject({ version: expect.any(String) });
});

test("private pages and durable-run APIs reject an anonymous user", async ({ page, request }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);

  const run = await request.get("/api/generation-runs/00000000-0000-4000-8000-000000000000");
  expect(run.status()).toBe(401);

  const admin = await request.get("/admin/reconcile", { maxRedirects: 0 });
  expect([302, 303, 307, 308, 401, 403, 404]).toContain(admin.status());
});

test("growth-loop routes fail closed without a session", async ({ request }) => {
  const goals = await request.get("/api/growth-loop/goals");
  expect(goals.status()).toBe(401);

  // The tab page 404s while the pilot is off (nav-level gate) and still
  // redirects to login when the flag is on — both are safe outcomes.
  const page = await request.get("/operations/growth", { maxRedirects: 0 });
  expect([302, 303, 307, 308, 404]).toContain(page.status());

  // The legacy standalone route now forwards into the operations tab.
  const legacy = await request.get("/growth", { maxRedirects: 0 });
  expect([307, 308]).toContain(legacy.status());
});
