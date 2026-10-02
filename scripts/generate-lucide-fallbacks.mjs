#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adapterPath = path.join(projectRoot, "components/ui/icons.tsx");
const outputPath = path.join(projectRoot, "components/ui/lucide-fallbacks.ts");
const source = await readFile(adapterPath, "utf8");
const names = [...source.matchAll(/^export const (\w+) = createFinfoldIcon/gm)]
  .map((match) => match[1])
  .sort((left, right) => left.localeCompare(right));

if (names.length === 0) {
  throw new Error(`Could not find semantic icon exports in ${adapterPath}`);
}

const generated = `/* eslint-disable */
/** GENERATED FILE — emergency Lucide fallbacks for every Finfold icon. */

import {
${names.map((name) => `  ${name} as Lucide${name}`).join(",\n")}
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const lucideFallbacks = {
${names.map((name) => `  ${name}: Lucide${name}`).join(",\n")}
} satisfies Record<string, LucideIcon>;
`;

await writeFile(outputPath, generated, "utf8");
console.log(`Wrote ${names.length} Lucide fallbacks to ${outputPath}`);
