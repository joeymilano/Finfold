import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const tempDirectories: string[] = [];
const script = join(process.cwd(), "scripts/check-worker-size.mjs");

function makeWorkerDirectory() {
  const root = mkdtempSync(join(tmpdir(), "finfold-worker-size-"));
  tempDirectories.push(root);
  const worker = join(root, "_worker.js");
  mkdirSync(worker);
  return worker;
}

afterEach(() => {
  for (const path of tempDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("Cloudflare Worker size gate", () => {
  it("passes below the configured compressed ceiling and ignores the build log", () => {
    const worker = makeWorkerDirectory();
    writeFileSync(join(worker, "index.js"), "export default { fetch() {} };".repeat(20));
    writeFileSync(join(worker, "nop-build-log.json"), "x".repeat(100_000));

    const result = spawnSync(process.execPath, [script, worker], {
      encoding: "utf8",
      env: { ...process.env, WORKER_COMPRESSED_LIMIT_BYTES: "1024" }
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
    expect(result.stdout).toContain("Configured Workers plan: Paid");
    expect(result.stdout).toContain("Cloudflare Paid limit: 10.00 MiB");
    expect(result.stdout).toContain("Measured modules: 1");
  });

  it("fails before an oversized bundle can be released", () => {
    const worker = makeWorkerDirectory();
    const bytes = Buffer.allocUnsafe(4096);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (index * 131 + Math.floor(index / 7)) % 256;
    }
    writeFileSync(join(worker, "index.js"), bytes);

    const result = spawnSync(process.execPath, [script, worker], {
      encoding: "utf8",
      env: { ...process.env, WORKER_COMPRESSED_LIMIT_BYTES: "128" }
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("exceeds the safety ceiling");
  });
});
