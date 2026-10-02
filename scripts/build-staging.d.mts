export const stagingBuildVarNames: string[];

export function buildStagingEnvironment(
  configSource: string,
  baseEnvironment?: Record<string, string | undefined>
): Record<string, string | undefined>;

export function runStagingBuild(
  root?: string,
  spawn?: typeof import("node:child_process").spawnSync
): number;
