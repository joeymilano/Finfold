import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDirectory, "..");

export const workerPolicies = [
  {
    label: "main Worker",
    name: process.env.CLOUDFLARE_MAIN_WORKER ?? "finfold-app",
    config: "wrangler.toml",
    requiredSecrets: [
      "SUPABASE_SERVICE_ROLE_KEY",
      "TURNSTILE_SECRET_KEY",
      "INTEGRATION_ENCRYPTION_KEY",
      "CRON_WATCH_SECRET",
      "CRON_PERF_SECRET",
      "CREEM_WEBHOOK_SECRET",
      "LETTA_API_KEY",
      "DASHSCOPE_FREE_API_KEY",
      "DASHSCOPE_API_KEY",
      "DEEPSEEK_API_KEY",
      "IMAGE_API_KEY",
      "CLOUDFLARE_AI_TOKEN",
      "CREEM_API_KEY",
      "ADMIN_USER_IDS",
      "GENERATION_WORKER_SECRET",
      "X_OAUTH_CLIENT_ID",
      "X_OAUTH_CLIENT_SECRET",
      "WECHAT_COMPONENT_APP_ID",
      "WECHAT_COMPONENT_APP_SECRET",
      "WECHAT_COMPONENT_TOKEN",
      "WECHAT_COMPONENT_ENCODING_AES_KEY",
      "MISSIONGET_WEBHOOK_SECRET",
      "MISSIONGET_PARTNER_USER_ID",
      "ZCWPAY_PID",
      "ZCWPAY_MERCHANT_PRIVATE_KEY",
      "ZCWPAY_PLATFORM_PUBLIC_KEY"
    ],
    requiredVars: [
      "ZHIPU_ENABLED",
      "ZHIPU_API_MODE",
      "ZHIPU_API_BASE",
      "ZHIPU_MODEL",
      "ZHIPU_MODEL_STRONG",
      "ZHIPU_VISION_MODEL",
      "ZHIPU_PRIORITY_EXPIRES_AT",
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      "NEXT_PUBLIC_POSTHOG_KEY",
      "NEXT_PUBLIC_POSTHOG_HOST",
      "FINFOLD_DEPLOYMENT_ENV",
      "GENERATION_QUEUE_NAME",
      "GENERATION_DLQ_NAME",
      "SOURCE_IMAGE_BROWSER_FALLBACK_ENABLED",
      "SOURCE_IMAGE_SEARCH_ENABLED",
      "SIGNAL_DISCOVERY_ENABLED",
      "SIGNAL_DISCOVERY_PROVIDER_NAMES"
    ],
    conditionalSecrets: {
      ZHIPU_ENABLED: "ZHIPU_API_KEY",
      SOURCE_IMAGE_BROWSER_FALLBACK_ENABLED: "CLOUDFLARE_BROWSER_RUN_TOKEN"
    },
    expectedVars: {
      SIGNAL_DISCOVERY_ENABLED: "true",
      SIGNAL_DISCOVERY_USER_IDS: "",
      FINFOLD_DEPLOYMENT_ENV: "production",
      NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      GENERATION_QUEUE_NAME: "finfold-generation-jobs",
      GENERATION_DLQ_NAME: "finfold-generation-jobs-dlq"
    },
    forbiddenVars: ["STAGING_GENERATION_FAULT_MODE"]
  },
  {
    label: "poller Worker",
    name: process.env.CLOUDFLARE_POLLER_WORKER ?? "finfold-watch-poller",
    config: "workers/watch-poller/wrangler.toml",
    requiredSecrets: [
      "CRON_WATCH_SECRET",
      "CRON_PERF_SECRET",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY"
    ],
    requiredVars: [
      "FINFOLD_APP_URL",
      "FINFOLD_STAGING_URL",
      "STAGING_SUPABASE_URL",
      "STAGING_SUPABASE_ANON_KEY"
    ],
    expectedVars: {
      FINFOLD_APP_URL: "https://www.finfold.app",
      FINFOLD_STAGING_URL: "https://your-staging-worker.your-name.workers.dev",
      STAGING_SUPABASE_URL: "https://your-staging-project-ref.supabase.co"
    }
  }
];

export const stagingWorkerPolicy = {
  label: "staging Worker",
  name: process.env.CLOUDFLARE_STAGING_WORKER ?? "finfold-app-staging",
  config: "wrangler.staging.toml",
  requiredSecrets: workerPolicies[0].requiredSecrets,
  requiredVars: [
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_APP_URL",
    "FINFOLD_DEPLOYMENT_ENV",
    "GENERATION_QUEUE_NAME",
    "GENERATION_DLQ_NAME",
    "SOURCE_IMAGE_BROWSER_FALLBACK_ENABLED",
    "SOURCE_IMAGE_SEARCH_ENABLED"
  ],
  conditionalSecrets: workerPolicies[0].conditionalSecrets,
  expectedVars: {
    FINFOLD_DEPLOYMENT_ENV: "staging",
    GENERATION_QUEUE_NAME: "finfold-staging-generation-jobs",
    GENERATION_DLQ_NAME: "finfold-staging-generation-jobs-dlq",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA"
  }
};

export function buildSecretListArgs(policy, root = defaultRoot) {
  return [
    "wrangler",
    "secret",
    "list",
    "--name",
    policy.name,
    "--config",
    resolve(root, policy.config),
    "--format",
    "json"
  ];
}

export function buildDeploymentListArgs(policy, root = defaultRoot) {
  return [
    "wrangler",
    "deployments",
    "list",
    "--name",
    policy.name,
    "--config",
    resolve(root, policy.config),
    "--json"
  ];
}

export function buildVersionViewArgs(policy, versionId, root = defaultRoot) {
  return [
    "wrangler",
    "versions",
    "view",
    versionId,
    "--name",
    policy.name,
    "--config",
    resolve(root, policy.config),
    "--json"
  ];
}

export function parseSecretNames(output) {
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed)) {
    throw new Error("Wrangler returned a non-array secret list.");
  }

  return new Set(
    parsed.map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && typeof entry.name === "string") {
        return entry.name;
      }
      throw new Error("Wrangler returned an invalid secret-list entry.");
    })
  );
}

export function parseActiveVersionIds(output) {
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Wrangler returned no deployments.");
  }

  const latest = [...parsed].sort(
    (left, right) =>
      Date.parse(String(right?.created_on ?? "")) -
      Date.parse(String(left?.created_on ?? ""))
  )[0];
  if (!latest || !Array.isArray(latest.versions)) {
    throw new Error("Wrangler returned an invalid deployment.");
  }

  const active = latest.versions
    .filter((entry) => Number(entry?.percentage) > 0)
    .map((entry) => entry?.version_id)
    .filter((versionId) => typeof versionId === "string" && versionId.length > 0);
  if (active.length === 0) {
    throw new Error("The latest deployment has no active versions.");
  }
  return active;
}

export function parseVersionBindings(output) {
  const parsed = JSON.parse(output);
  const bindings = parsed?.resources?.bindings;
  if (!Array.isArray(bindings)) {
    throw new Error("Wrangler returned no version bindings.");
  }

  return new Map(
    bindings
      .filter(
        (binding) =>
          binding && typeof binding === "object" && typeof binding.name === "string"
      )
      .map((binding) => [binding.name, binding])
  );
}

function tomlSection(source, sectionName) {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const header = source.match(new RegExp(`^\\[${escaped}\\]\\s*$`, "m"));
  if (!header || header.index === undefined) return "";

  const bodyStart = header.index + header[0].length;
  const remainder = source.slice(bodyStart);
  const nextSection = remainder.search(/^\[[^\]]+\]\s*$/m);
  return nextSection === -1 ? remainder : remainder.slice(0, nextSection);
}

export function readDeclaredRequiredSecrets(source) {
  const section = tomlSection(source, "secrets");
  const match = section.match(/^\s*required\s*=\s*\[([\s\S]*?)\]/m);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

export function readTomlVar(source, name) {
  const section = tomlSection(source, "vars");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = section.match(new RegExp(`^\\s*${escaped}\\s*=\\s*"([^"]*)"\\s*$`, "m"));
  return match?.[1]?.trim() ?? "";
}

export function inspectPolicy(policy, secretNames, configSource) {
  const checks = [];
  for (const name of policy.requiredSecrets) {
    checks.push({
      ok: secretNames.has(name),
      label: `${policy.name} secret ${name}`
    });
  }
  for (const [flag, secret] of Object.entries(policy.conditionalSecrets ?? {})) {
    if (readTomlVar(configSource, flag) !== "true") continue;
    checks.push({ ok: secretNames.has(secret), label: `${policy.name} secret ${secret} required by ${flag}` });
  }

  const declared = readDeclaredRequiredSecrets(configSource);
  const declaredSet = new Set(declared);
  const missingDeclarations = policy.requiredSecrets.filter((name) => !declaredSet.has(name));
  const unexpectedDeclarations = declared.filter(
    (name) => !policy.requiredSecrets.includes(name)
  );
  checks.push({
    ok: missingDeclarations.length === 0 && unexpectedDeclarations.length === 0,
    label: `${policy.name} wrangler.toml secrets.required matches the production policy`,
    detail:
      missingDeclarations.length > 0
        ? `missing declarations: ${missingDeclarations.join(", ")}`
        : unexpectedDeclarations.length > 0
          ? `unexpected declarations: ${unexpectedDeclarations.join(", ")}`
          : ""
  });

  for (const name of policy.requiredVars) {
    const value = readTomlVar(configSource, name);
    checks.push({
      ok: Boolean(value) && !/replace|changeme|todo/i.test(value),
      label: `${policy.name} var ${name}`
    });
  }

  for (const [name, expected] of Object.entries(policy.expectedVars ?? {})) {
    checks.push({
      ok: readTomlVar(configSource, name) === expected,
      label: `${policy.name} var ${name} is ${expected}`
    });
  }

  for (const name of policy.forbiddenVars ?? []) {
    checks.push({
      ok: readTomlVar(configSource, name) === "",
      label: `${policy.name} does not declare staging-only var ${name}`
    });
  }

  return checks;
}

export function inspectDeployedPolicy(policy, bindings, configSource) {
  const checks = [];
  for (const name of policy.requiredSecrets) {
    checks.push({
      ok: bindings.get(name)?.type === "secret_text",
      label: `${policy.name} deployed secret ${name}`
    });
  }
  for (const [flag, secret] of Object.entries(policy.conditionalSecrets ?? {})) {
    if (readTomlVar(configSource, flag) !== "true") continue;
    checks.push({ ok: bindings.get(secret)?.type === "secret_text", label: `${policy.name} deployed secret ${secret} required by ${flag}` });
  }

  for (const name of policy.requiredVars) {
    const expected = readTomlVar(configSource, name);
    const binding = bindings.get(name);
    checks.push({
      ok: binding?.type === "plain_text" && binding.text === expected,
      label: `${policy.name} deployed var ${name} matches ${policy.config}`
    });
  }

  // Enforce production decisions independently of a potentially stale checkout.
  for (const [name, expected] of Object.entries(policy.expectedVars ?? {})) {
    const binding = bindings.get(name);
    checks.push({
      ok: binding?.type === "plain_text" && binding.text === expected,
      label: `${policy.name} deployed var ${name} matches required production value`
    });
  }

  for (const name of policy.forbiddenVars ?? []) {
    checks.push({
      ok: !bindings.has(name),
      label: `${policy.name} deployed version excludes ${name}`
    });
  }

  return checks;
}

function listWorkerSecrets(policy, root) {
  const result = spawnSync("npx", buildSecretListArgs(policy, root), {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      WRANGLER_LOG_PATH:
        process.env.WRANGLER_LOG_PATH ?? `/tmp/finfold-wrangler-${policy.name}.log`
    }
  });

  if (result.status !== 0) {
    throw new Error(
      `Unable to inspect ${policy.label} "${policy.name}". Authenticate Wrangler with ` +
        "`CLOUDFLARE_API_TOKEN` (or `npx wrangler login`) and retry."
    );
  }

  try {
    return parseSecretNames(result.stdout);
  } catch {
    throw new Error(
      `Unable to parse the secret-name list for ${policy.label} "${policy.name}".`
    );
  }
}

function runWranglerJson(args, policy, root, action) {
  const result = spawnSync("npx", args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      WRANGLER_LOG_PATH:
        process.env.WRANGLER_LOG_PATH ?? `/tmp/finfold-wrangler-${policy.name}.log`
    }
  });

  if (result.status !== 0) {
    throw new Error(
      `Unable to ${action} for ${policy.label} "${policy.name}". Authenticate Wrangler with ` +
        "`CLOUDFLARE_API_TOKEN` (or `npx wrangler login`) and retry."
    );
  }
  return result.stdout;
}

function listDeployedWorkerVersions(policy, root) {
  const deployments = runWranglerJson(
    buildDeploymentListArgs(policy, root),
    policy,
    root,
    "inspect deployments"
  );
  let versionIds;
  try {
    versionIds = parseActiveVersionIds(deployments);
  } catch {
    throw new Error(
      `Unable to parse deployments for ${policy.label} "${policy.name}".`
    );
  }

  return versionIds.map((versionId) => {
    const version = runWranglerJson(
      buildVersionViewArgs(policy, versionId, root),
      policy,
      root,
      `inspect deployed version ${versionId}`
    );
    try {
      return { versionId, bindings: parseVersionBindings(version) };
    } catch {
      throw new Error(
        `Unable to parse deployed version ${versionId} for ${policy.label} "${policy.name}".`
      );
    }
  });
}

export function runCloudflareSecurityCheck(root = defaultRoot, policies = workerPolicies) {
  let blocking = 0;

  for (const policy of policies) {
    process.stdout.write(`\n${policy.label}: ${policy.name}\n`);
    let secretNames;
    try {
      secretNames = listWorkerSecrets(policy, root);
    } catch (error) {
      process.stderr.write(`FAIL ${error.message}\n`);
      blocking += 1;
      continue;
    }

    const configSource = readFileSync(resolve(root, policy.config), "utf8");
    for (const check of inspectPolicy(policy, secretNames, configSource)) {
      process.stdout.write(`${check.ok ? "PASS" : "FAIL"} ${check.label}\n`);
      if (check.detail) process.stdout.write(`     ${check.detail}\n`);
      if (!check.ok) blocking += 1;
    }
  }

  if (blocking > 0) {
    process.stderr.write(`\n${blocking} blocking Cloudflare configuration check(s) failed.\n`);
    return 1;
  }

  process.stdout.write(
    "\nCloudflare Worker secret and public-variable baselines are ready.\n"
  );
  return 0;
}

export function runCloudflareDeploymentCheck(root = defaultRoot, policies = workerPolicies) {
  let blocking = 0;

  for (const policy of policies) {
    process.stdout.write(`\n${policy.label}: ${policy.name}\n`);
    let deployedVersions;
    try {
      deployedVersions = listDeployedWorkerVersions(policy, root);
    } catch (error) {
      process.stderr.write(`FAIL ${error.message}\n`);
      blocking += 1;
      continue;
    }

    const configSource = readFileSync(resolve(root, policy.config), "utf8");
    for (const { versionId, bindings } of deployedVersions) {
      process.stdout.write(`Active version: ${versionId}\n`);
      for (const check of inspectDeployedPolicy(policy, bindings, configSource)) {
        process.stdout.write(`${check.ok ? "PASS" : "FAIL"} ${check.label}\n`);
        if (!check.ok) blocking += 1;
      }
    }
  }

  if (blocking > 0) {
    process.stderr.write(`\n${blocking} deployed Cloudflare binding check(s) failed.\n`);
    return 1;
  }

  process.stdout.write("\nActive Cloudflare Worker bindings match the repository policy.\n");
  return 0;
}

function selectedPolicies(argv) {
  if (argv.includes("--staging")) return [stagingWorkerPolicy];
  if (argv.includes("--poller")) return [workerPolicies[1]];
  if (argv.includes("--main")) return [workerPolicies[0]];
  return workerPolicies;
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (entrypoint === import.meta.url) {
  const policies = selectedPolicies(process.argv);
  process.exitCode = process.argv.includes("--deployed")
    ? runCloudflareDeploymentCheck(defaultRoot, policies)
    : runCloudflareSecurityCheck(defaultRoot, policies);
}
