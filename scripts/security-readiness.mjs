import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  readDeclaredRequiredSecrets,
  readTomlVar
} from "./cloudflare-security-check.mjs";

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const root = process.cwd();
const productionConfigPath = resolve(root, "wrangler.toml");
const productionConfig = existsSync(productionConfigPath)
  ? readFileSync(productionConfigPath, "utf8")
  : "";
const productionVarNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_APP_URL",
  "ALLOW_MOCK"
];
const productionVars = Object.fromEntries(
  productionVarNames.flatMap((name) => {
    const value = readTomlVar(productionConfig, name);
    return value ? [[name, value]] : [];
  })
);
const declaredRemoteSecrets = new Set(
  readDeclaredRequiredSecrets(productionConfig)
);
const env = {
  ...parseEnvFile(resolve(root, ".env")),
  ...parseEnvFile(resolve(root, ".env.local")),
  ...productionVars,
  ...process.env
};

const checks = [];
const optionalChecks = [];
const required = (key, reason) => {
  const localOrPublic = Boolean(env[key]);
  const remote = !localOrPublic && declaredRemoteSecrets.has(key);
  checks.push({
    level: "error",
    ok: localOrPublic || remote,
    status: remote ? "REMOTE" : undefined,
    label: key,
    reason: remote
      ? `${reason}; encrypted value is verified by the Cloudflare gate`
      : reason
  });
};
const optional = (key, reason) => optionalChecks.push({
  ok: Boolean(env[key]),
  label: key,
  reason
});

required("NEXT_PUBLIC_SUPABASE_URL", "database and authentication endpoint");
required("NEXT_PUBLIC_SUPABASE_ANON_KEY", "browser authentication");
required("SUPABASE_SERVICE_ROLE_KEY", "durable server-side persistence");
required("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "browser bot challenge");
required("NEXT_PUBLIC_POSTHOG_KEY", "measurable activation and retention funnel");
required("NEXT_PUBLIC_POSTHOG_HOST", "PostHog ingestion endpoint");
required("TURNSTILE_SECRET_KEY", "server-side bot verification");
required("INTEGRATION_ENCRYPTION_KEY", "encrypted user integration credentials");
required("CRON_WATCH_SECRET", "authenticated update-monitoring jobs");
required("CRON_PERF_SECRET", "authenticated performance jobs");
required("CREEM_WEBHOOK_SECRET", "payment webhook authenticity");
required("DASHSCOPE_API_KEY", "Qwen Agent, diagnosis, video understanding, and Wan image generation");
required("DASHSCOPE_FREE_API_KEY", "free-first Qwen diagnosis and Qwen Image generation");
required("IMAGE_API_KEY", "generated cover images");
optional("FOUNDER_EMAILS", "legacy email-based founder allow-list; production admin access uses encrypted ADMIN_USER_IDS");
optional("CLOUDFLARE_BROWSER_RUN_TOKEN", "rendered HTML fallback; required only when SOURCE_IMAGE_BROWSER_FALLBACK_ENABLED=true");

if (env.SOURCE_IMAGE_BROWSER_FALLBACK_ENABLED === "true") {
  required("CLOUDFLARE_BROWSER_RUN_TOKEN", "required when rendered source-image discovery is enabled");
}

const appUrl = env.NEXT_PUBLIC_APP_URL ?? "";
checks.push({
  level: "error",
  ok: appUrl.startsWith("https://"),
  label: "NEXT_PUBLIC_APP_URL",
  reason: "must use HTTPS in production"
});

checks.push({
  level: "error",
  ok: env.ALLOW_MOCK !== "true",
  label: "ALLOW_MOCK",
  reason: "must not be true for production"
});

let encryptionKeyValid = false;
if (env.INTEGRATION_ENCRYPTION_KEY) {
  try {
    encryptionKeyValid = Buffer.from(env.INTEGRATION_ENCRYPTION_KEY, "base64").byteLength === 32;
  } catch {
    encryptionKeyValid = false;
  }
}
const encryptionKeyRemote = !env.INTEGRATION_ENCRYPTION_KEY
  && declaredRemoteSecrets.has("INTEGRATION_ENCRYPTION_KEY");
checks.push({
  level: "error",
  ok: encryptionKeyValid || encryptionKeyRemote,
  status: encryptionKeyRemote ? "REMOTE" : undefined,
  label: "INTEGRATION_ENCRYPTION_KEY format",
  reason: encryptionKeyRemote
    ? "encrypted value is intentionally unreadable locally; runtime enforces the 32-byte format"
    : "must be a base64-encoded 32-byte key"
});

const failures = checks.filter((check) => !check.ok);
for (const check of checks) {
  const status = check.status ?? (check.ok ? "PASS" : "FAIL");
  process.stdout.write(`${status.padEnd(4)} ${check.label} — ${check.reason}\n`);
}
for (const check of optionalChecks) {
  process.stdout.write(`${(check.ok ? "PASS" : "OPTIONAL").padEnd(8)} ${check.label} — ${check.reason}\n`);
}

const errors = failures;
const optionalMissing = optionalChecks.filter((check) => !check.ok).length;
process.stdout.write(`\n${checks.length - failures.length}/${checks.length} security checks passed; ${errors.length} blocking.\n`);
if (optionalMissing > 0) {
  process.stdout.write(`${optionalMissing} optional integration setting(s) are not configured; they do not block release.\n`);
}
if (errors.length === 0) {
  process.stdout.write("Local/build configuration is ready; continuing with remote Worker secret verification.\n");
}
if (errors.length > 0) process.exitCode = 1;
