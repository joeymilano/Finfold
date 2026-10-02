import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { zipSync } from "fflate";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const store = process.env.VITE_STORE_BUILD === "1";
// The store build numbers ahead of the pilot zip and carries its own name so
// support pages can reference "store 1.1.5" unambiguously.
const STORE_VERSION = "1.1.5";
const STORE_VERSION_NAME = "1.1.5 Social Drafts";
const files = {};

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else files[relative(dist, path).replaceAll("\\", "/")] = new Uint8Array(await readFile(path));
  }
}

await collect(dist);
if (!files["manifest.json"]) throw new Error("manifest.json must be at the ZIP root.");
if (store) {
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  manifest.version = STORE_VERSION;
  manifest.version_name = STORE_VERSION_NAME;
  // The store build ships the reply assistant as inert stubs, so it must not
  // request access to the reply pilot platforms; only the pilot zip does.
  manifest.host_permissions = ["https://www.finfold.app/*"];
  delete manifest.optional_host_permissions;
  const patched = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  files["manifest.json"] = patched;
  // Keep the unpacked dist identical to the ZIP so a cold-profile load
  // during store review matches the submitted artifact byte for byte.
  await writeFile(resolve(dist, "manifest.json"), patched);
}
const release = resolve(root, "release");
await mkdir(release, { recursive: true });
const version = JSON.parse(new TextDecoder().decode(files["manifest.json"])).version;
const output = resolve(release, `finfold-chrome-extension-v${version}${store ? "-store" : ""}.zip`);
await writeFile(output, zipSync(files, { level: 9 }));
process.stdout.write(`${output}\n`);
