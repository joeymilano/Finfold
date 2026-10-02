#!/usr/bin/env node

/**
 * One-time cleanup: rewrite raw technical errors persisted in
 * agent_messages.content.error into typed errorCodes so every client locale
 * renders the friendly copy from lib/agent/provider-errors.ts.
 *
 *   technical JSON/stack/network text  ->  { error: "", errorCode: "AGENT_RUN_FAILED" }
 *   legacy provider-busy raw text      ->  { error: "", errorCode: "PROVIDER_BUSY" }
 *
 * Rows keep everything else in `content` untouched. Only assistant rows with
 * a non-empty content.error are considered; user-facing messages are never
 * rewritten.
 *
 * Usage:
 *   node --env-file=.env.local scripts/clean-agent-message-errors.mjs            # dry-run
 *   node --env-file=.env.local scripts/clean-agent-message-errors.mjs --apply
 *
 * The regexes below MIRROR lib/agent/provider-errors.ts — update both together.
 */

import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local");
  process.exit(1);
}

// Mirrors TECHNICAL_ERROR_PATTERNS in lib/agent/provider-errors.ts
const TECHNICAL_ERROR_PATTERNS = [
  /Unterminated\s+(?:string|identifier|comment|regular)/i,
  /Unexpected (?:token|end of (?:JSON|input))/i,
  /\bposition \d+\s*\(line \d+ column \d+\)/i,
  /^(?:SyntaxError|TypeError|ReferenceError|RangeError|URIError)\b/,
  /\b(?:fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up)\b/i,
  /^LLM request failed/i,
  /\bat\s+[\w$.<>]+\s*\(.*(\/|node:).*:\d+/
];

// Mirrors LEGACY_PROVIDER_BUSY_PATTERN in lib/agent/provider-errors.ts
const LEGACY_PROVIDER_BUSY_PATTERN = /(?:LLM request failed\s*:\s*429|["']?code["']?\s*:\s*["']?1305|该模型当前访问量过大|model (?:is )?(?:currently )?(?:busy|overloaded)|too many requests)/i;

function classify(errorText) {
  const trimmed = String(errorText).trim();
  if (!trimmed) return null;
  if (TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed))) return "AGENT_RUN_FAILED";
  if (LEGACY_PROVIDER_BUSY_PATTERN.test(trimmed)) return "PROVIDER_BUSY";
  return null;
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
console.log(`Target: ${supabaseUrl.replace(/^https?:\/\//, "").split(".")[0]}  mode: ${apply ? "APPLY" : "dry-run"}`);

const PAGE = 500;
let from = 0;
let scanned = 0;
let matched = { AGENT_RUN_FAILED: 0, PROVIDER_BUSY: 0 };
const samples = [];
let updated = 0;
let failed = 0;

while (true) {
  const { data, error } = await admin
    .from("agent_messages")
    .select("id, content")
    .eq("role", "assistant")
    .not("content->>error", "is", null)
    .neq("content->>error", "")
    .range(from, from + PAGE - 1);
  if (error) {
    console.error(`Query failed at offset ${from}: ${error.message}`);
    process.exit(1);
  }
  if (!data || data.length === 0) break;

  for (const row of data) {
    scanned += 1;
    const content = row.content;
    if (!content || typeof content !== "object" || Array.isArray(content)) continue;
    const code = classify(content.error);
    if (!code) continue;
    matched[code] += 1;
    if (samples.length < 5) {
      samples.push({ id: row.id, code, error: String(content.error).slice(0, 120) });
    }
    if (!apply) continue;

    const nextContent = { ...content, error: "", errorCode: code };
    const { error: updateError } = await admin
      .from("agent_messages")
      .update({ content: nextContent })
      .eq("id", row.id);
    if (updateError) {
      failed += 1;
      console.error(`  ✗ ${row.id}: ${updateError.message}`);
    } else {
      updated += 1;
    }
  }

  if (data.length < PAGE) break;
  from += PAGE;
}

console.log(`\nScanned ${scanned} assistant rows with a stored error.`);
console.log(`  AGENT_RUN_FAILED (technical): ${matched.AGENT_RUN_FAILED}`);
console.log(`  PROVIDER_BUSY (legacy 429):   ${matched.PROVIDER_BUSY}`);
for (const sample of samples) {
  console.log(`  e.g. [${sample.code}] ${sample.id} :: ${sample.error}`);
}
if (apply) {
  console.log(`\nUpdated: ${updated}${failed ? `, FAILED: ${failed}` : ""}`);
  console.log(failed ? "Some rows failed — re-run to retry." : "Done.");
} else if (matched.AGENT_RUN_FAILED + matched.PROVIDER_BUSY > 0) {
  console.log("\nDry-run only. Re-run with --apply to rewrite these rows.");
} else {
  console.log("\nNothing to clean — all stored errors are user-facing copy.");
}
