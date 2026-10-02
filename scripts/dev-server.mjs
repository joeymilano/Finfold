#!/usr/bin/env node
/**
 * Dev-server launcher that accepts Vite-style `--host` / `--port` flags.
 *
 * Kimi Work's website preview spawns `npm run dev -- --host <h> --port <p>`
 * (Vite conventions). Next.js only understands `--hostname` and exits with
 * "unknown option '--host'", so the preview card reports "网站启动失败".
 * This wrapper translates the flags and forwards everything else verbatim,
 * so both plain `npm run dev` and the preview launcher work.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);

const rawArgs = process.argv.slice(2);
const args = rawArgs.map((arg) => {
  if (arg === "--host") return "--hostname";
  if (arg.startsWith("--host=")) return `--hostname=${arg.slice("--host=".length)}`;
  return arg;
});

let nextBin;
try {
  nextBin = require.resolve("next/dist/bin/next");
} catch {
  console.error("[dev-server] Cannot resolve the next binary — run npm install first.");
  process.exit(1);
}

const child = spawn(process.execPath, [nextBin, "dev", ...args], {
  stdio: "inherit",
  env: process.env
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(0);
  }
  process.exit(code ?? 0);
});
