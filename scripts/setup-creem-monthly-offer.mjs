#!/usr/bin/env node
// Default is a read-only check. --apply creates only this new, scoped discount.
import { readFileSync } from "node:fs";
import { CREEM_PRICING_V2_PRODUCTS } from "./creem-pricing-v2-catalog.mjs";

const offer = JSON.parse(readFileSync(new URL("../lib/payment/monthly-offer.json", import.meta.url), "utf8"));
const key = process.env.CREEM_API_KEY;
if (!key) throw new Error("CREEM_API_KEY is required.");
const test = key.startsWith("creem_test_");
const base = test ? "https://test-api.creem.io/v1" : "https://api.creem.io/v1";
const apply = process.argv.includes("--apply");
if (apply && !test && !process.argv.includes("--allow-live")) throw new Error("Live creation requires --allow-live.");

async function request(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "x-api-key": key, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (response.status === 404 && !body) return null;
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    const message = JSON.stringify(details.message ?? details.error ?? "Unknown error").replaceAll(key, "[redacted]");
    throw new Error(`Creem returned HTTP ${response.status}: ${message.slice(0, 800)}. No existing products or subscriptions were changed.`);
  }
  return response.json();
}

const products = CREEM_PRICING_V2_PRODUCTS.filter((product) => product.planKey !== "digital_employee");
const ids = [];
for (const product of products) {
  const id = process.env[product.envKey];
  if (!id) throw new Error(`Missing ${product.envKey}`);
  const remote = await request(`/products?product_id=${encodeURIComponent(id)}`);
  if (!remote || remote.id !== id || remote.status !== "active" || remote.price !== product.price ||
      remote.currency !== "USD" || remote.billing_type !== "recurring" || remote.billing_period !== "every-month" ||
      remote.tax_mode !== "inclusive" || remote.trial_period_days > 0) {
    throw new Error(`Unexpected monthly product configuration: ${product.envKey}`);
  }
  ids.push(id);
}
const productIds = [...new Set(ids)].sort();
const payload = { name: "Finfold monthly renewal 10% off", code: offer.code,
  type: "percentage", percentage: offer.percentage, duration: "forever", applies_to_products: productIds };

function verify(discount) {
  if (!discount || discount.code !== offer.code || discount.status !== "active" ||
      discount.type !== "percentage" || discount.percentage !== offer.percentage || discount.duration !== "forever" ||
      discount.expiry_date || discount.max_redemptions != null ||
      JSON.stringify([...(discount.applies_to_products ?? [])].sort()) !== JSON.stringify(productIds)) {
    throw new Error("Existing discount does not match the requested continuing 10% offer. No changes made.");
  }
}

const existing = await request(`/discounts?discount_code=${encodeURIComponent(offer.code)}`);
if (existing) {
  verify(existing);
  console.log(JSON.stringify({ environment: test ? "test" : "live", status: "verified", ...payload }, null, 2));
} else if (!apply) {
  console.log(JSON.stringify({ environment: test ? "test" : "live", status: "ready_to_create", ...payload }, null, 2));
} else {
  await request("/discounts", payload);
  verify(await request(`/discounts?discount_code=${encodeURIComponent(offer.code)}`));
  console.log(JSON.stringify({ environment: test ? "test" : "live", status: "created_and_verified", ...payload }, null, 2));
}
