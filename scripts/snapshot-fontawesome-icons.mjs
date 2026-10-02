#!/usr/bin/env node

/**
 * Freeze the small set of Font Awesome Pro icon definitions used by Finfold.
 *
 * Run this only while the private Pro packages are installed and the account
 * is licensed to download them. The generated snapshot lets normal installs,
 * CI builds, and deployments avoid Font Awesome's private npm registry.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adapterPath = path.join(projectRoot, "components/ui/icons.tsx");
const outputPath = path.join(projectRoot, "components/ui/fontawesome-pro-snapshot.ts");
const source = await readFile(adapterPath, "utf8");

const definitions = [];
const snapshotImportPattern =
  /import\s*{([^}]*)}\s*from\s*["']\.\/fontawesome-pro-snapshot["'];/g;
const importGroups = [...source.matchAll(snapshotImportPattern)].map((match) =>
  match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
);

if (importGroups.length !== 4) {
  throw new Error(`Expected regular, light, signature, and Brands snapshot imports in ${adapterPath}`);
}

const packageGroups = [
  "@fortawesome/sharp-regular-svg-icons",
  "@fortawesome/sharp-light-svg-icons",
  "@fortawesome/sharp-duotone-solid-svg-icons",
  "@fortawesome/free-brands-svg-icons"
];

for (const [groupIndex, localNames] of importGroups.entries()) {
  const packageName = packageGroups[groupIndex];

  for (const localName of localNames) {
    const exportName =
      groupIndex === 1
        ? `fa${localName.slice("faLight".length)}`
        : groupIndex === 2
          ? `fa${localName.slice("faSignature".length)}`
          : localName;
    const packageExports = await import(packageName);
    const definition = packageExports[exportName];

    if (!definition || typeof definition !== "object" || !Array.isArray(definition.icon)) {
      throw new Error(`Missing icon definition ${exportName} from ${packageName}`);
    }

    definitions.push({ localName, definition });
  }
}

definitions.sort((left, right) => left.localName.localeCompare(right.localName));

const generated = `/* eslint-disable */
/**
 * GENERATED FILE — Font Awesome Pro 7.3.1 icon subset for Finfold.
 *
 * Licensed commercial assets. Keep this file in the private Finfold project;
 * do not publish it as an icon package or copy it into an open-source repo.
 * Regenerate with: npm run icons:snapshot
 */

import type { FontAwesomeSnapshotDefinition } from "./fontawesome-icon-types";

${definitions
  .map(
    ({ localName, definition }) =>
      `export const ${localName} = ${JSON.stringify(definition)} as unknown as FontAwesomeSnapshotDefinition;`
  )
  .join("\n")}
`;

await writeFile(outputPath, generated, "utf8");
console.log(`Wrote ${definitions.length} licensed icon definitions to ${outputPath}`);
