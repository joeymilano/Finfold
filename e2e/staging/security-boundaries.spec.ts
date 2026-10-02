import { expect, test } from "@playwright/test";

type BrowserResponse = { status: number; body: unknown };

test("rejects private-network capture URLs before fetching", async ({ page }) => {
  await page.goto("/workbench");
  const response = await page.evaluate(async (): Promise<BrowserResponse> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const result = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "http://127.0.0.1:3000/admin" }),
        signal: controller.signal
      });
      return { status: result.status, body: await result.json() };
    } finally {
      window.clearTimeout(timeout);
    }
  });

  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({ error: expect.any(String) });
});

test("rejects a file whose MIME type does not match its bytes", async ({ page }) => {
  await page.goto("/workbench");
  const response = await page.evaluate(async (): Promise<BrowserResponse> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const form = new FormData();
      form.append(
        "files",
        new File(["<html><script>alert('nope')</script></html>"], "not-really-an-image.png", {
          type: "image/png"
        })
      );
      const result = await fetch("/api/media", {
        method: "POST",
        body: form,
        signal: controller.signal
      });
      return { status: result.status, body: await result.json() };
    } finally {
      window.clearTimeout(timeout);
    }
  });

  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({ error: expect.stringMatching(/supported|match/i) });
});
