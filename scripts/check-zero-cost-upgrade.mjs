#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenBindings = [
  "workflows",
  "browser",
  "ratelimits",
  "durable_objects",
  "kv_namespaces",
  "r2_buckets",
  "d1_databases",
  "vectorize",
  "hyperdrive",
  "analytics_engine_datasets",
  "ai"
];

function fail(message) {
  console.error(`Zero-cost boundary failed: ${message}`);
  process.exitCode = 1;
}

function queueNames(source) {
  return [...source.matchAll(/^\s*queue\s*=\s*"([^"]+)"\s*$/gm)]
    .map((match) => match[1])
    .sort();
}

function cronValues(source) {
  const match = source.match(/^crons\s*=\s*\[([^\]]*)\]\s*$/m);
  return match
    ? [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]).sort()
    : [];
}

function assertNoNewBillableBindings(path, source) {
  for (const binding of forbiddenBindings) {
    const expression = new RegExp(`^\\s*\\[+\\s*${binding}(?:[.\\]\\s]|$)`, "mi");
    if (expression.test(source)) {
      fail(`${path} declares the blocked ${binding} binding.`);
    }
  }
}

function assertExactValues(path, label, actual, expected) {
  if (actual.join("\n") !== expected.join("\n")) {
    fail(`${path} ${label} changed from the approved zero-cost baseline.`);
  }
}

const productionPath = join(root, "wrangler.toml");
const stagingPath = join(root, "wrangler.staging.toml");
const production = readFileSync(productionPath, "utf8");
const staging = readFileSync(stagingPath, "utf8");

assertNoNewBillableBindings("wrangler.toml", production);
assertNoNewBillableBindings("wrangler.staging.toml", staging);
assertExactValues(
  "wrangler.toml",
  "Queue names",
  queueNames(production),
  ["finfold-generation-jobs", "finfold-generation-jobs", "finfold-generation-jobs-dlq"].sort()
);
assertExactValues(
  "wrangler.staging.toml",
  "Queue names",
  queueNames(staging),
  ["finfold-staging-generation-jobs", "finfold-staging-generation-jobs", "finfold-staging-generation-jobs-dlq"].sort()
);
assertExactValues(
  "wrangler.toml",
  "Cron triggers",
  cronValues(production),
  // Existing production schedules, reconciled in a01c702 and verified through
  // the Cloudflare schedules API on 2026-09-21; 30 2 * * * and 30 13 * * *
  // joined with the daily content pipeline in 7b65fad (10:30/21:30 Beijing).
  // Keep this exact allowlist so additional triggers still fail the check.
  ["* * * * *", "17 2 * * *", "0 0 * * *", "30 12 * * *", "30 2 * * *", "30 13 * * *"].sort()
);
assertExactValues("wrangler.staging.toml", "Cron triggers", cronValues(staging), []);

if (process.exitCode) process.exit(process.exitCode);
console.log("Zero-cost resource boundary passed: no new Cloudflare bindings, Queues, or Cron triggers.");
