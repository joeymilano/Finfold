import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDeploymentListArgs,
  buildSecretListArgs,
  buildVersionViewArgs,
  inspectDeployedPolicy,
  inspectPolicy,
  parseActiveVersionIds,
  parseSecretNames,
  parseVersionBindings,
  readDeclaredRequiredSecrets,
  readTomlVar,
  stagingWorkerPolicy,
  workerPolicies
} from "../scripts/cloudflare-security-check.mjs";

const policy = {
  label: "test Worker",
  name: "finfold-test",
  config: "wrangler.test.toml",
  requiredSecrets: ["DATABASE_KEY", "API_KEY"],
  requiredVars: ["PUBLIC_SITE_KEY"]
};

describe("Cloudflare Worker security gate", () => {
  it("rejects a restored Signal allowlist even when a stale checkout agrees with it", () => {
    const main = workerPolicies[0];
    const stale = '[vars]\nSIGNAL_DISCOVERY_ENABLED = "true"\nSIGNAL_DISCOVERY_USER_IDS = "old-pilot"';
    const bindings = new Map<string, { name: string; type: string; text: string }>([
      ["SIGNAL_DISCOVERY_ENABLED", { name: "SIGNAL_DISCOVERY_ENABLED", type: "plain_text", text: "true" }],
      ["SIGNAL_DISCOVERY_USER_IDS", { name: "SIGNAL_DISCOVERY_USER_IDS", type: "plain_text", text: "old-pilot" }]
    ]);
    const label = `${main.name} deployed var SIGNAL_DISCOVERY_USER_IDS matches required production value`;
    expect(inspectDeployedPolicy(main, bindings, stale).find(check => check.label === label)?.ok).toBe(false);
    expect(inspectPolicy(main, new Set(), stale).find(check => check.label === `${main.name} var SIGNAL_DISCOVERY_USER_IDS is `)?.ok).toBe(false);
    bindings.set("SIGNAL_DISCOVERY_USER_IDS", { name: "SIGNAL_DISCOVERY_USER_IDS", type: "plain_text", text: "" });
    expect(inspectDeployedPolicy(main, bindings, stale).find(check => check.label === label)?.ok).toBe(true);
    bindings.delete("SIGNAL_DISCOVERY_USER_IDS");
    expect(inspectDeployedPolicy(main, bindings, stale).find(check => check.label === label)?.ok).toBe(false);
  });

  it.each(["ZHIPU_ENABLED"])("requires the optional model credential only when %s is enabled", flag => {
    const secret = stagingWorkerPolicy.conditionalSecrets![flag];
    expect(secret).toBeTruthy();
    expect(stagingWorkerPolicy.requiredSecrets).not.toContain(secret);
    const optionalPolicy = { ...policy, requiredSecrets: [], requiredVars: [], conditionalSecrets: { [flag]: secret } };
    const disabled = `[vars]\n${flag} = "false"`;
    const enabled = `[vars]\n${flag} = "true"`;
    expect(inspectDeployedPolicy(optionalPolicy, new Map(), disabled)).toEqual([]);
    expect(inspectDeployedPolicy(optionalPolicy, new Map(), enabled)).toEqual([
      expect.objectContaining({ ok: false })
    ]);
    expect(inspectDeployedPolicy(optionalPolicy, new Map([[secret, { name: secret, type: "secret_text" }]]), enabled)).toEqual([
      expect.objectContaining({ ok: true })
    ]);
  });

  it("uses the Workers secret-list command with JSON output", () => {
    expect(buildSecretListArgs(policy, "/repo")).toEqual([
      "wrangler",
      "secret",
      "list",
      "--name",
      "finfold-test",
      "--config",
      "/repo/wrangler.test.toml",
      "--format",
      "json"
    ]);
  });

  it("builds deployment and version commands for the same Worker policy", () => {
    expect(buildDeploymentListArgs(policy, "/repo")).toEqual([
      "wrangler",
      "deployments",
      "list",
      "--name",
      "finfold-test",
      "--config",
      "/repo/wrangler.test.toml",
      "--json"
    ]);
    expect(buildVersionViewArgs(policy, "version-1", "/repo")).toEqual([
      "wrangler",
      "versions",
      "view",
      "version-1",
      "--name",
      "finfold-test",
      "--config",
      "/repo/wrangler.test.toml",
      "--json"
    ]);
  });

  it("parses only secret names from Wrangler JSON", () => {
    const names = parseSecretNames(
      JSON.stringify([
        { name: "DATABASE_KEY", type: "secret_text" },
        { name: "API_KEY", type: "secret_text" }
      ])
    );

    expect([...names]).toEqual(["DATABASE_KEY", "API_KEY"]);
  });

  it("selects every active version from the newest deployment", () => {
    expect(
      parseActiveVersionIds(
        JSON.stringify([
          {
            created_on: "2026-08-01T00:00:00Z",
            versions: [{ version_id: "old", percentage: 100 }]
          },
          {
            created_on: "2026-08-02T00:00:00Z",
            versions: [
              { version_id: "new-a", percentage: 90 },
              { version_id: "new-b", percentage: 10 },
              { version_id: "inactive", percentage: 0 }
            ]
          }
        ])
      )
    ).toEqual(["new-a", "new-b"]);
  });

  it("checks the bindings carried by the active deployed version", () => {
    const source = `
[secrets]
required = ["DATABASE_KEY", "API_KEY"]

[vars]
PUBLIC_SITE_KEY = "public-key"
`;
    const bindings = parseVersionBindings(
      JSON.stringify({
        resources: {
          bindings: [
            { name: "DATABASE_KEY", type: "secret_text" },
            { name: "API_KEY", type: "secret_text" },
            { name: "PUBLIC_SITE_KEY", type: "plain_text", text: "public-key" }
          ]
        }
      })
    );
    expect(inspectDeployedPolicy(policy, bindings, source).every((check) => check.ok)).toBe(true);

    bindings.set("PUBLIC_SITE_KEY", {
      name: "PUBLIC_SITE_KEY",
      type: "plain_text",
      text: "stale-key"
    });
    expect(
      inspectDeployedPolicy(policy, bindings, source)
        .filter((check) => !check.ok)
        .map((check) => check.label)
    ).toEqual([
      "finfold-test deployed var PUBLIC_SITE_KEY matches wrangler.test.toml"
    ]);
  });

  it("checks remote secrets, deploy declarations, and public Worker vars", () => {
    const source = `
[secrets]
required = ["DATABASE_KEY", "API_KEY"]

[vars]
PUBLIC_SITE_KEY = "public-key"
`;
    const checks = inspectPolicy(
      policy,
      new Set(["DATABASE_KEY", "API_KEY"]),
      source
    );

    expect(checks.every((check) => check.ok)).toBe(true);
    expect(readDeclaredRequiredSecrets(source)).toEqual(["DATABASE_KEY", "API_KEY"]);
    expect(readTomlVar(source, "PUBLIC_SITE_KEY")).toBe("public-key");
  });

  it("requires only the browser fallback secret when its feature flag is enabled", () => {
    const conditionalPolicy = {
      ...policy,
      requiredVars: ["PUBLIC_SITE_KEY", "SOURCE_IMAGE_BROWSER_FALLBACK_ENABLED", "SOURCE_IMAGE_SEARCH_ENABLED"],
      conditionalSecrets: { SOURCE_IMAGE_BROWSER_FALLBACK_ENABLED: "CLOUDFLARE_BROWSER_RUN_TOKEN" }
    };
    const enabled = `
[secrets]
required = ["DATABASE_KEY", "API_KEY"]

[vars]
PUBLIC_SITE_KEY = "public-key"
SOURCE_IMAGE_BROWSER_FALLBACK_ENABLED = "true"
SOURCE_IMAGE_SEARCH_ENABLED = "true"
`;
    expect(inspectPolicy(conditionalPolicy, new Set(["DATABASE_KEY", "API_KEY"]), enabled).some((check) => check.label.includes("CLOUDFLARE_BROWSER_RUN_TOKEN") && !check.ok)).toBe(true);
    expect(inspectPolicy(conditionalPolicy, new Set(["DATABASE_KEY", "API_KEY", "CLOUDFLARE_BROWSER_RUN_TOKEN"]), enabled).every((check) => check.ok)).toBe(true);
    const disabled = enabled.replace('SOURCE_IMAGE_BROWSER_FALLBACK_ENABLED = "true"', 'SOURCE_IMAGE_BROWSER_FALLBACK_ENABLED = "false"');
    expect(inspectPolicy(conditionalPolicy, new Set(["DATABASE_KEY", "API_KEY"]), disabled).every((check) => check.ok)).toBe(true);
  });

  it("fails closed for a missing secret, drifted declarations, or placeholder var", () => {
    const source = `
[secrets]
required = ["DATABASE_KEY"]

[vars]
PUBLIC_SITE_KEY = "REPLACE_BEFORE_DEPLOY"
`;
    const checks = inspectPolicy(policy, new Set(["DATABASE_KEY"]), source);

    expect(checks.filter((check) => !check.ok).map((check) => check.label)).toEqual([
      "finfold-test secret API_KEY",
      "finfold-test wrangler.toml secrets.required matches the production policy",
      "finfold-test var PUBLIC_SITE_KEY"
    ]);
  });

  it("enforces exact production markers and forbids staging-only vars", () => {
    const deploymentPolicy = {
      ...policy,
      requiredVars: ["PUBLIC_SITE_KEY", "FINFOLD_DEPLOYMENT_ENV"],
      expectedVars: { FINFOLD_DEPLOYMENT_ENV: "production" },
      forbiddenVars: ["STAGING_GENERATION_FAULT_MODE"]
    };
    const safe = `
[secrets]
required = ["DATABASE_KEY", "API_KEY"]

[vars]
PUBLIC_SITE_KEY = "public-key"
FINFOLD_DEPLOYMENT_ENV = "production"
`;
    expect(
      inspectPolicy(
        deploymentPolicy,
        new Set(["DATABASE_KEY", "API_KEY"]),
        safe
      ).every((check) => check.ok)
    ).toBe(true);

    const unsafe = `${safe}\nSTAGING_GENERATION_FAULT_MODE = "provider_timeout_once"\n`;
    const failed = inspectPolicy(
      deploymentPolicy,
      new Set(["DATABASE_KEY", "API_KEY"]),
      unsafe
    ).filter((check) => !check.ok);
    expect(failed.map((check) => check.label)).toContain(
      "finfold-test does not declare staging-only var STAGING_GENERATION_FAULT_MODE"
    );
  });

  it("keeps the repository deployment declarations aligned with the P0 policy", () => {
    const mainConfig = readFileSync(join(process.cwd(), "wrangler.toml"), "utf8");
    const pollerConfig = readFileSync(
      join(process.cwd(), "workers/watch-poller/wrangler.toml"),
      "utf8"
    );
    const rootPackage = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };
    const pollerPackage = JSON.parse(
      readFileSync(join(process.cwd(), "workers/watch-poller/package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(readDeclaredRequiredSecrets(mainConfig)).toEqual([
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
    ]);
    expect(readDeclaredRequiredSecrets(pollerConfig)).toEqual([
      "CRON_WATCH_SECRET",
      "CRON_PERF_SECRET",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY"
    ]);
    expect(readTomlVar(mainConfig, "ADMIN_USER_IDS")).toBe("");
    expect(readTomlVar(mainConfig, "FINFOLD_DEPLOYMENT_ENV")).toBe("production");
    expect(readTomlVar(mainConfig, "NEXT_PUBLIC_POSTHOG_KEY")).toMatch(/^phc_/);
    expect(readTomlVar(mainConfig, "NEXT_PUBLIC_POSTHOG_HOST")).toBe(
      "https://us.i.posthog.com"
    );
    expect(readTomlVar(mainConfig, "GENERATION_QUEUE_NAME")).toBe(
      "finfold-generation-jobs"
    );
    expect(readTomlVar(mainConfig, "GENERATION_DLQ_NAME")).toBe(
      "finfold-generation-jobs-dlq"
    );
    expect(readTomlVar(mainConfig, "STAGING_GENERATION_FAULT_MODE")).toBe("");
    expect(readTomlVar(pollerConfig, "FINFOLD_APP_URL")).toBe(
      "https://www.finfold.app"
    );
    expect(readTomlVar(pollerConfig, "FINFOLD_STAGING_URL")).toBe(
      "https://your-staging-worker.your-name.workers.dev"
    );
    expect(readTomlVar(pollerConfig, "STAGING_SUPABASE_URL")).toBe(
      "https://your-staging-project-ref.supabase.co"
    );
    expect(readTomlVar(pollerConfig, "STAGING_SUPABASE_ANON_KEY")).toMatch(
      /^sb_publishable_/
    );
    expect(rootPackage.scripts?.deploy).toContain("npm run security:check");
    expect(rootPackage.scripts?.["security:check"]).toContain(
      "security:check:cloudflare"
    );
    expect(rootPackage.scripts?.["predeploy:poller"]).toBe(
      "npm run security:check:cloudflare"
    );
    expect(rootPackage.scripts?.["postdeploy:poller"]).toContain(
      "--poller --deployed"
    );
    expect(rootPackage.scripts?.["postdeploy:staging"]).toContain(
      "--staging --deployed"
    );
    expect(rootPackage.scripts?.postdeploy).toContain("--main --deployed");
    expect(pollerPackage.scripts?.predeploy).toContain(
      "cloudflare-security-check.mjs"
    );
    expect(pollerPackage.scripts?.postdeploy).toContain("--poller --deployed");
    expect(mainConfig).toMatch(
      /\[\[routes\]\]\s+pattern\s*=\s*"www\.finfold\.app"\s+custom_domain\s*=\s*true/
    );
  });

  it("keeps staging isolated, cron-free, and configured with its own public key", () => {
    const config = readFileSync(
      join(process.cwd(), "wrangler.staging.toml"),
      "utf8"
    );
    const checks = inspectPolicy(
      stagingWorkerPolicy,
      new Set(stagingWorkerPolicy.requiredSecrets),
      config
    );

    expect(checks.find((check) => check.label.endsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY"))?.ok).toBe(true);
    expect(readTomlVar(config, "FINFOLD_DEPLOYMENT_ENV")).toBe("staging");
    expect(config).toContain('queue = "finfold-staging-generation-jobs"');
    expect(config).toContain(
      'dead_letter_queue = "finfold-staging-generation-jobs-dlq"'
    );
    expect(config).not.toMatch(/^\[triggers\]$/m);
    expect(config).not.toContain("www.finfold.app");
    expect(config).not.toContain("your-project-ref.supabase.co");
  });
});
