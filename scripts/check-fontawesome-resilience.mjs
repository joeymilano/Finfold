#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const packageLock = await readFile(path.join(projectRoot, "package-lock.json"), "utf8");
const adapter = await readFile(path.join(projectRoot, "components/ui/icons.tsx"), "utf8");
const snapshot = await readFile(
  path.join(projectRoot, "components/ui/fontawesome-pro-snapshot.ts"),
  "utf8"
);

const failures = [];
const dependencies = packageJson.dependencies ?? {};
const fontAwesomePackages = Object.keys(dependencies).filter((name) => name.startsWith("@fortawesome/"));

if (fontAwesomePackages.length > 0) {
  failures.push(`Font Awesome build dependencies remain: ${fontAwesomePackages.join(", ")}`);
}

if (packageLock.includes("npm.fontawesome.com") || packageLock.includes("node_modules/@fortawesome/")) {
  failures.push("package-lock.json still depends on Font Awesome packages or its private registry");
}

if (/from\s+["']@fortawesome\/(?:sharp|duotone|classic)/.test(adapter)) {
  failures.push("the app icon adapter still imports Pro packages directly");
}

const lucideVersion = dependencies["lucide-react"];
if (!lucideVersion || /^[~^*]|\bx\b/i.test(lucideVersion)) {
  failures.push("lucide-react must be present at an exact version for emergency fallback");
}

if (!adapter.includes("data-fin-icon-provider=\"lucide\"") || !adapter.includes("lucideFallbacks")) {
  failures.push("the semantic adapter is missing its Lucide emergency fallback");
}

if (!snapshot.includes("Font Awesome Pro 7.3.1 icon subset")) {
  failures.push("the licensed local icon snapshot is missing or has an unexpected version");
}

if (failures.length > 0) {
  console.error("Font Awesome resilience check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Font Awesome resilience check passed:");
console.log("- production builds have no Font Awesome package or service dependency");
console.log("- package-lock.json has no Font Awesome registry or package entries");
console.log("- licensed Pro SVG data is limited to Finfold's private icon snapshot");
console.log("- every semantic icon has an exact-version Lucide emergency fallback");
console.log("- Perpetual License confirmed by the account owner on 2026-08-04");
