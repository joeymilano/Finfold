import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const required = [
  "PLAYWRIGHT_BASE_URL",
  "E2E_USER_EMAIL",
  "E2E_USER_PASSWORD",
  "E2E_SECONDARY_USER_EMAIL",
  "E2E_SECONDARY_USER_PASSWORD"
];
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error(`Staging E2E is missing: ${missing.join(", ")}`);
  console.error("Use dedicated staging accounts. Never point this mutating suite at production.");
  process.exit(1);
}

const target = new URL(process.env.PLAYWRIGHT_BASE_URL);
const isLocal = target.hostname === "127.0.0.1" || target.hostname === "localhost";
const isClearlyStaging = /(^|[.-])(staging|preview)([.-]|$)/i.test(target.hostname);
if (!isLocal && !isClearlyStaging) {
  console.error(`Refusing mutating E2E because the host is not clearly staging/preview: ${target.hostname}`);
  process.exit(1);
}
if (target.protocol !== "https:" && !isLocal) {
  console.error("Staging E2E requires HTTPS (localhost is the only exception). ");
  process.exit(1);
}

const cli = resolve("node_modules/@playwright/test/cli.js");
const faultMode = process.env.E2E_FAULT_MODE?.trim();
const recoveryRunId = process.env.E2E_RECOVERY_RUN_ID?.trim();
const args = [cli, "test", "--project=staging-chromium"];
if (recoveryRunId) {
  args.push("e2e/staging/recovery-cleanup.spec.ts");
} else if (faultMode && faultMode !== "none") {
  args.push("e2e/staging/fault-mode.spec.ts");
}
const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, E2E_TARGET: "staging" }
});

process.exit(result.status ?? 1);
