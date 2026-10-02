export const cloudflareBuildVarNames: readonly string[];

export function buildCloudflareEnvironment(
  configSource: string,
  baseEnvironment?: Record<string, string | undefined>
): Record<string, string | undefined>;

export function runCloudflareBuild(
  root?: string,
  spawn?: typeof import("node:child_process").spawnSync
): number;
