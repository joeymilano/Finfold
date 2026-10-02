#!/usr/bin/env node

/**
 * Create / verify the four one-time Creem credit-pack products.
 *
 * Mirrors scripts/setup-creem-pricing-v2.mjs but for ONE-TIME products:
 *   - no --market flag (a single global product per pack)
 *   - productPayload omits billing_period and abandoned_cart_recovery
 *     (recurring-only fields)
 *   - the final guard checks for exactly four products
 *
 * Usage:
 *   node scripts/setup-creem-credit-packs.mjs                      # offline plan
 *   node --env-file=.env.local scripts/setup-creem-credit-packs.mjs --check
 *   node --env-file=.env.local scripts/setup-creem-credit-packs.mjs --apply
 *   node --env-file=.env.local scripts/setup-creem-credit-packs.mjs --apply --allow-live
 *
 * Keep CREEM_API_KEY in .env.local or a secret manager; never commit it.
 */

import { CREEM_CREDIT_PACK_PRODUCTS, productAmount } from "./creem-credit-packs-catalog.mjs";

const args = new Set(process.argv.slice(2));
const mode = args.has("--apply") ? "apply" : args.has("--check") ? "check" : "plan";
const asJson = args.has("--json");

const apiKey = process.env.CREEM_API_KEY?.trim();
const isTest = apiKey?.startsWith("creem_test_") ?? false;
const isLive = Boolean(apiKey) && !isTest;
const baseUrl = isTest ? "https://test-api.creem.io/v1" : "https://api.creem.io/v1";

// One-time payload is intentionally smaller than the subscription one: no
// billing_period, no abandoned_cart_recovery_enabled (both are recurring-only).
function productPayload(product) {
  return {
    name: product.name,
    description: product.description,
    price: product.price,
    currency: product.currency,
    billing_type: product.billingType, // "onetime"
    tax_mode: product.taxMode,
    tax_category: product.taxCategory
  };
}

// Mirror the payload shape exactly when reading a remote product back, so the
// JSON comparison is field-for-field. billing_period is deliberately ignored —
// a one-time product may return null/absent there and that must not count as a
// mismatch.
function normalizedRemote(remote) {
  return {
    name: remote.name,
    description: remote.description,
    price: Number(remote.price),
    currency: remote.currency,
    billing_type: remote.billing_type,
    tax_mode: remote.tax_mode,
    tax_category: remote.tax_category
  };
}

function payloadMatches(product, remote) {
  return JSON.stringify(productPayload(product)) === JSON.stringify(normalizedRemote(remote));
}

async function creemRequest(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message ?? data?.message ?? `Creem API request failed (${response.status}).`;
    throw new Error(message);
  }
  return data;
}

async function listProducts() {
  const items = [];
  let page = 1;
  while (page <= 100) {
    const result = await creemRequest(`/products/search?page_number=${page}&page_size=100`);
    items.push(...(result.items ?? []));
    const totalPages = Number(result.pagination?.total_pages ?? 1);
    if (page >= totalPages) break;
    page += 1;
  }
  return items;
}

function resolveCatalog(catalogItems, remoteProducts) {
  return catalogItems.map((product) => {
    const sameName = remoteProducts.filter(
      (remote) => remote.name === product.name && remote.status !== "archived"
    );
    const exact = sameName.filter((remote) => payloadMatches(product, remote));
    if (exact.length > 1) {
      return { product, status: "conflict", reason: "multiple identical active products", matches: exact };
    }
    if (exact.length === 1) {
      return { product, status: "reuse", remote: exact[0] };
    }
    if (sameName.length > 0) {
      return {
        product,
        status: "conflict",
        reason: "same name with different price, currency, description, or billing settings",
        matches: sameName
      };
    }
    return { product, status: "create" };
  });
}

function publicRow(entry) {
  return {
    envKey: entry.product.envKey,
    packId: entry.product.packId,
    name: entry.product.name,
    description: entry.product.description,
    amount: productAmount(entry.product),
    status: entry.status,
    productId: entry.remote?.id
  };
}

function printPlan(entries, environment) {
  if (asJson) {
    console.log(JSON.stringify({ mode, environment, products: entries.map(publicRow) }, null, 2));
    return;
  }

  console.log(`Creem Credit Packs — ${mode} (${environment})`);
  for (const entry of entries) {
    console.log(`\n[${entry.status.toUpperCase()}] ${entry.product.envKey}`);
    console.log(`${entry.product.name} — ${productAmount(entry.product)} (one-time)`);
    console.log(entry.product.description);
    if (entry.remote?.id) console.log(`Product ID: ${entry.remote.id}`);
    if (entry.reason) console.log(`Conflict: ${entry.reason}`);
  }

  const configured = entries.filter((entry) => entry.remote?.id);
  if (configured.length > 0) {
    console.log("\nEnvironment variables:");
    for (const entry of configured) console.log(`${entry.product.envKey}=${entry.remote.id}`);
  }
}

if (args.has("--help")) {
  console.log(`Usage:
  node scripts/setup-creem-credit-packs.mjs
  node --env-file=.env.local scripts/setup-creem-credit-packs.mjs --check
  node --env-file=.env.local scripts/setup-creem-credit-packs.mjs --apply [--allow-live]

The default mode is a network-free plan. --check is read-only. --apply creates
only missing one-time products and reuses exact matches. A live key additionally
requires --allow-live. Add --json for machine-readable output.`);
  process.exit(0);
}

if (mode === "plan") {
  printPlan(
    CREEM_CREDIT_PACK_PRODUCTS.map((product) => ({ product, status: "planned" })),
    "offline"
  );
  process.exit(0);
}

if (!apiKey) {
  throw new Error(
    "CREEM_API_KEY is required for --check or --apply. Keep it in .env.local or your secret manager; never commit it."
  );
}

if (mode === "apply" && isLive && !args.has("--allow-live")) {
  throw new Error(
    "Refusing to create live Creem products without --allow-live. Run --check first, then repeat with --apply --allow-live."
  );
}

const remoteProducts = await listProducts();
const resolved = resolveCatalog(CREEM_CREDIT_PACK_PRODUCTS, remoteProducts);
const conflicts = resolved.filter((entry) => entry.status === "conflict");

if (conflicts.length > 0) {
  printPlan(resolved, isTest ? "test" : "live");
  throw new Error("Resolve the Creem product conflicts above before creating anything.");
}

if (mode === "check") {
  printPlan(resolved, isTest ? "test" : "live");
  process.exit(0);
}

for (const entry of resolved) {
  if (entry.status !== "create") continue;
  const remote = await creemRequest("/products", {
    method: "POST",
    body: JSON.stringify(productPayload(entry.product))
  });
  entry.status = "created";
  entry.remote = remote;
}

printPlan(resolved, isTest ? "test" : "live");

// Guard against accidentally changing the intended eight-product catalog
// (4 packs × 2 markets).
if (CREEM_CREDIT_PACK_PRODUCTS.length !== 8) {
  throw new Error("Credit pack catalog must contain exactly eight one-time Creem products (4 packs × 2 markets).");
}
