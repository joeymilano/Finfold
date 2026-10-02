import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const store = process.env.VITE_STORE_BUILD === "1";
const STORE_VERSION = "1.1.5";
const STORE_VERSION_NAME = "1.1.5 Social Drafts";
const expectedVersion = store ? STORE_VERSION : JSON.parse(await readFile(resolve(root, "public/manifest.json"), "utf8")).version;
const zipPath = resolve(root, `release/finfold-chrome-extension-v${expectedVersion}${store ? "-store" : ""}.zip`);
const files = unzipSync(new Uint8Array(await readFile(zipPath)));
const fail = (message) => { throw new Error(`Extension package audit failed: ${message}`); };
if (!files["manifest.json"]) fail("manifest.json is not at ZIP root");

const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
if (manifest.version !== expectedVersion) fail("package version mismatch");
if (store && manifest.version_name !== STORE_VERSION_NAME) fail("store version_name mismatch");
const expectedPermissions = ["activeTab", "contextMenus", "identity", "scripting", "sidePanel", "storage"];
const actualPermissions = [...(manifest.permissions ?? [])].sort();
if (JSON.stringify(actualPermissions) !== JSON.stringify(expectedPermissions)) fail("permission set drifted");
// Only the pilot zip carries the reply pilot platforms; the store build stubs
// the reply assistant out and must keep the minimal finfold-only host set.
// The pilot declares the platforms as optional host permissions so the side
// panel can request them with one click (Chrome 137+ grants nothing at install).
const expectedHosts = ["https://www.finfold.app/*"];
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(expectedHosts)) fail("host permissions drifted");
const expectedOptionalHosts = store
  ? []
  : ["https://xiaohongshu.com/*", "https://*.xiaohongshu.com/*", "https://linkedin.com/*", "https://*.linkedin.com/*", "https://x.com/*", "https://*.x.com/*", "https://twitter.com/*", "https://*.twitter.com/*"];
if (JSON.stringify(manifest.optional_host_permissions ?? []) !== JSON.stringify(expectedOptionalHosts)) fail("optional host permissions drifted");
if (manifest.minimum_chrome_version !== "116") fail("minimum Chrome version must be 116");

const forbidden = [
  [/<all_urls>/i, "all_urls"],
  [/https?:\/\/(localhost|127\.0\.0\.1)/i, "development address"],
  [/\beval\s*\(/, "eval"],
  [/new\s+Function\s*\(/, "dynamic Function"],
  [/WebAssembly\.(compile|instantiateStreaming)/, "remote/dynamic WASM"],
  [/sourceMappingURL=/, "source map reference"],
  [/sb_secret_[A-Za-z0-9_-]+/, "Supabase secret"],
  [/sk-[A-Za-z0-9]{20,}/, "API secret"]
];
for (const [name, bytes] of Object.entries(files)) {
  if (!/\.(?:js|css|html|json)$/.test(name)) continue;
  const text = new TextDecoder().decode(bytes);
  for (const [pattern, label] of forbidden) if (pattern.test(text)) fail(`${label} found in ${name}`);
}
for (const size of [16, 32, 48, 128]) {
  const icon = files[`icons/icon-${size}.png`];
  if (!icon) fail(`missing ${size}px icon`);
  const metadata = await sharp(icon).metadata();
  if (metadata.width !== size || metadata.height !== size) fail(`icon-${size}.png has wrong dimensions`);
}
const sidepanel = new TextDecoder().decode(files['sidepanel.js']);
for (const theme of ['light', 'dark']) {
  const logo = await readFile(resolve(root, `src/assets/app-icon-${theme}.webp`));
  if (!sidepanel.includes(`data:image/webp;base64,${logo.toString('base64')}`)) fail(`canonical ${theme} logo is not embedded in the side panel`);
}
if (!Object.keys(files).some((name) => name.endsWith('.woff2'))) fail('packaged Geist font is missing');
if (!files['Geist-LICENSE.txt']) fail('Geist font license is missing');
if (store) {
  // The store build must not carry the reply assistant in bundled form. The
  // sentinels are ASCII-only because esbuild escapes non-ASCII literals, and
  // each exists solely in ReplyPanel.tsx / automation.ts, which the store
  // aliases replace with inert stubs.
  const background = new TextDecoder().decode(files['background.js']);
  for (const [name, text] of [['sidepanel.js', sidepanel], ['background.js', background]]) {
    if (/Confirm & send|REPLY_DAILY_LIMIT_REACHED/.test(text)) fail(`${name} still bundles the reply UI`);
    if (/contenteditable/.test(text)) fail(`${name} still bundles DOM automation`);
  }
}
process.stdout.write(`Audited ${Object.keys(files).length} packaged files: PASS\n`);
