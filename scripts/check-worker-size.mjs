#!/usr/bin/env node

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { gzipSync } from "node:zlib";

const DEFAULT_WORKER_ENTRY = ".open-next/worker.js";
// Finfold runs on Workers Paid (wrangler.toml sets the Paid-only 300s CPU
// ceiling). Cloudflare's current compressed script limit is 10 MB on Paid.
const CLOUDFLARE_PAID_LIMIT_BYTES = 10 * 1024 * 1024;
// Leave 0.5 MiB for multipart metadata and small differences between the
// local build artifact and Wrangler's final upload representation.
const DEFAULT_SAFETY_LIMIT_BYTES = Math.floor(9.5 * 1024 * 1024);
const EXCLUDED_FILES = new Set(["nop-build-log.json"]);

function collectFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...collectFiles(path));
    else if (!EXCLUDED_FILES.has(entry)) files.push(path);
  }
  return files;
}

function formatMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function parseWranglerGzipBytes(output) {
  const match = output.match(
    /gzip:\s*([\d.]+)\s*(bytes?|KiB|MiB)/i
  );
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(value)) return null;
  if (unit === "mib") return Math.ceil(value * 1024 * 1024);
  if (unit === "kib") return Math.ceil(value * 1024);
  return Math.ceil(value);
}

function measureOpenNextBundle() {
  const entry = resolve(process.cwd(), DEFAULT_WORKER_ENTRY);
  if (!existsSync(entry)) {
    process.stderr.write(
      `Worker bundle not found at ${entry}. Run \`npm run build:cf\` first.\n`
    );
    process.exit(1);
  }

  const outputDirectory = mkdtempSync(
    join(tmpdir(), "finfold-worker-bundle-")
  );
  try {
    const wrangler = resolve(
      process.cwd(),
      "node_modules/.bin/wrangler"
    );
    const result = spawnSync(
      wrangler,
      ["deploy", "--dry-run", "--outdir", outputDirectory],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          WRANGLER_LOG_PATH: join(outputDirectory, "wrangler.log")
        }
      }
    );

    if (result.status !== 0) {
      process.stderr.write(result.stderr || result.stdout);
      process.exit(result.status ?? 1);
    }

    const compressedBytes = parseWranglerGzipBytes(
      `${result.stdout}\n${result.stderr}`
    );
    if (compressedBytes === null) {
      process.stderr.write(
        "Could not read the compressed upload size from Wrangler dry-run output.\n"
      );
      process.exit(1);
    }

    return { compressedBytes, measuredModules: null };
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
}

function measureDirectory(directory) {
  const workerDir = resolve(process.cwd(), directory);
  if (!existsSync(workerDir)) {
    process.stderr.write(`Worker bundle not found at ${workerDir}.\n`);
    process.exit(1);
  }

  const files = collectFiles(workerDir);
  return {
    compressedBytes: files.reduce(
      (total, path) =>
        total + gzipSync(readFileSync(path), { level: 9 }).byteLength,
      0
    ),
    measuredModules: files.length
  };
}

const configuredLimit = Number(process.env.WORKER_COMPRESSED_LIMIT_BYTES);
const safetyLimit =
  Number.isFinite(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : DEFAULT_SAFETY_LIMIT_BYTES;

const measurement = process.argv[2]
  ? measureDirectory(process.argv[2])
  : measureOpenNextBundle();
const { compressedBytes, measuredModules } = measurement;
const remaining = safetyLimit - compressedBytes;

process.stdout.write(
  [
    `Worker compressed estimate: ${formatMiB(compressedBytes)}`,
    "Configured Workers plan: Paid",
    `CI safety ceiling: ${formatMiB(safetyLimit)}`,
    `Cloudflare Paid limit: ${formatMiB(CLOUDFLARE_PAID_LIMIT_BYTES)}`,
    measuredModules === null
      ? "Measurement: Wrangler deployment dry-run"
      : `Measured modules: ${measuredModules}`
  ].join("\n") + "\n"
);

if (compressedBytes > safetyLimit) {
  process.stderr.write(
    `Worker exceeds the safety ceiling by ${formatMiB(-remaining)}. Reduce the bundle before release.\n`
  );
  process.exit(1);
}

process.stdout.write(
  `PASS: ${formatMiB(remaining)} remains before the CI safety ceiling.\n`
);
