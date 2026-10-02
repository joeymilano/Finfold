import { expect, type Page } from "@playwright/test";

export type TestCredentials = { email: string; password: string };

export function credentials(prefix = "E2E_USER"): TestCredentials {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`Missing ${prefix}_EMAIL or ${prefix}_PASSWORD`);
  return { email, password };
}

export async function login(page: Page, account: TestCredentials) {
  await page.goto("/login");
  const emailInput = page.getByTestId("auth-email");
  const passwordInput = page.getByTestId("auth-password");
  await emailInput.fill(account.email);
  await passwordInput.fill(account.password);
  await page.getByTestId("auth-submit").click();
  try {
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 });
  } catch (error) {
    // Error-context snapshots serialize current input values. Clear both
    // staging credentials before Playwright captures the failed page.
    if (page.url().includes("/login")) {
      await passwordInput.fill("").catch(() => undefined);
      await emailInput.fill("").catch(() => undefined);
    }
    throw error;
  }
}
