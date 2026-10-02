import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readTomlVar } from "./cloudflare-security-check.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDirectory, "..");

export const stagingBuildVarNames = [
  "FINFOLD_DEPLOYMENT_ENV",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY"
];

export function buildStagingEnvironment(configSource, baseEnvironment = {}) {
  const configured = Object.fromEntries(
    stagingBuildVarNames.map((name) => [name, readTomlVar(configSource, name)])
  );
  const missing = stagingBuildVarNames.filter((name) => !configured[name]);
  if (missing.length > 0) {
    throw new Error(`wrangler.staging.toml is missing build var(s): ${missing.join(", ")}`);
  }

  const appUrl = new URL(configured.NEXT_PUBLIC_APP_URL);
  const supabaseUrl = new URL(configured.NEXT_PUBLIC_SUPABASE_URL);
  if (configured.FINFOLD_DEPLOYMENT_ENV !== "staging") {
    throw new Error("Refusing a staging build without FINFOLD_DEPLOYMENT_ENV=staging.");
  }
  if (appUrl.protocol !== "https:" || !/(^|[.-])staging([.-]|$)/i.test(appUrl.hostname)) {
    throw new Error("The staging app URL must use HTTPS and contain an explicit staging label.");
  }
  if (supabaseUrl.protocol !== "https:" || !supabaseUrl.hostname.endsWith(".supabase.co")) {
    throw new Error("The staging Supabase URL must be an HTTPS supabase.co project URL.");
  }

  return {
    ...baseEnvironment,
    ...configured,
    ALLOW_MOCK: "false",
    NEXT_PUBLIC_ALLOW_MOCK: "false"
  };
}

export function runStagingBuild(root = defaultRoot, spawn = spawnSync) {
  const configSource = readFileSync(resolve(root, "wrangler.staging.toml"), "utf8");
  const result = spawn("npx", ["opennextjs-cloudflare", "build"], {
    cwd: root,
    env: buildStagingEnvironment(configSource, process.env),
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (entrypoint === import.meta.url) process.exitCode = runStagingBuild();
