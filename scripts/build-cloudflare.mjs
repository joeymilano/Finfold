import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readTomlVar } from "./cloudflare-security-check.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDirectory, "..");

export const cloudflareBuildVarNames = [
  "FINFOLD_DEPLOYMENT_ENV",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "NEXT_PUBLIC_ALIPAY_QRCODE_IMAGE_URL",
  "NEXT_PUBLIC_ALIPAY_QRCODE_PAYEE_NAME",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST"
];

function requireBuildVar(source, name) {
  const value = readTomlVar(source, name);
  if (!value || /replace|changeme|todo/i.test(value)) {
    throw new Error(`wrangler.toml must define a production value for ${name}.`);
  }
  return value;
}

export function buildCloudflareEnvironment(configSource, baseEnvironment = process.env) {
  const environment = { ...baseEnvironment };

  for (const name of cloudflareBuildVarNames) {
    environment[name] = requireBuildVar(configSource, name);
  }

  if (environment.FINFOLD_DEPLOYMENT_ENV !== "production") {
    throw new Error("wrangler.toml FINFOLD_DEPLOYMENT_ENV must be production.");
  }
  if (!/^https:\/\/[^/]+\.supabase\.co$/i.test(environment.NEXT_PUBLIC_SUPABASE_URL)) {
    throw new Error("wrangler.toml NEXT_PUBLIC_SUPABASE_URL must be an HTTPS Supabase URL.");
  }
  if (environment.NEXT_PUBLIC_APP_URL !== "https://www.finfold.app") {
    throw new Error("wrangler.toml NEXT_PUBLIC_APP_URL must be https://www.finfold.app.");
  }
  if (!/^phc_[A-Za-z0-9_-]+$/.test(environment.NEXT_PUBLIC_POSTHOG_KEY)) {
    throw new Error("wrangler.toml NEXT_PUBLIC_POSTHOG_KEY must be a PostHog project API key.");
  }
  if (environment.NEXT_PUBLIC_POSTHOG_HOST !== "https://us.i.posthog.com") {
    throw new Error("wrangler.toml NEXT_PUBLIC_POSTHOG_HOST must be https://us.i.posthog.com.");
  }

  environment.ALLOW_MOCK = "false";
  environment.NEXT_PUBLIC_ALLOW_MOCK = "false";
  return environment;
}

export function runCloudflareBuild(root = defaultRoot, spawn = spawnSync) {
  const configSource = readFileSync(resolve(root, "wrangler.toml"), "utf8");
  const result = spawn("npx", ["opennextjs-cloudflare", "build"], {
    cwd: root,
    env: buildCloudflareEnvironment(configSource),
    stdio: "inherit"
  });

  if (result.error) throw result.error;
  return result.status ?? 1;
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entrypoint === import.meta.url) {
  process.exitCode = runCloudflareBuild();
}
