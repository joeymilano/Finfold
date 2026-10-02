import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { test as setup } from "@playwright/test";
import { credentials, login } from "./helpers/auth";

const primaryState = "playwright/.auth/primary.json";
const secondaryState = "playwright/.auth/secondary.json";

setup.beforeAll(async () => {
  await mkdir(dirname(primaryState), { recursive: true });
});

setup("authenticate the primary staging account", async ({ page }) => {
  await login(page, credentials());
  await page.context().storageState({ path: primaryState });
});

setup("authenticate the secondary staging account", async ({ page }) => {
  await login(page, credentials("E2E_SECONDARY_USER"));
  await page.context().storageState({ path: secondaryState });
});
