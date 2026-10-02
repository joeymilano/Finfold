export interface WorkerPolicy {
  label: string;
  name: string;
  config: string;
  requiredSecrets: string[];
  requiredVars: string[];
  conditionalSecrets?: Record<string, string>;
  expectedVars?: Record<string, string>;
  forbiddenVars?: string[];
}

export interface CloudflareConfigCheck {
  ok: boolean;
  label: string;
  detail?: string;
}

export interface CloudflareBinding {
  name: string;
  type: string;
  text?: string;
}

export const workerPolicies: WorkerPolicy[];
export const stagingWorkerPolicy: WorkerPolicy;

export function buildSecretListArgs(
  policy: WorkerPolicy,
  root?: string
): string[];

export function buildDeploymentListArgs(
  policy: WorkerPolicy,
  root?: string
): string[];

export function buildVersionViewArgs(
  policy: WorkerPolicy,
  versionId: string,
  root?: string
): string[];

export function parseSecretNames(output: string): Set<string>;

export function parseActiveVersionIds(output: string): string[];

export function parseVersionBindings(
  output: string
): Map<string, CloudflareBinding>;

export function readDeclaredRequiredSecrets(source: string): string[];

export function readTomlVar(source: string, name: string): string;

export function inspectPolicy(
  policy: WorkerPolicy,
  secretNames: Set<string>,
  configSource: string
): CloudflareConfigCheck[];

export function inspectDeployedPolicy(
  policy: WorkerPolicy,
  bindings: Map<string, CloudflareBinding>,
  configSource: string
): CloudflareConfigCheck[];

export function runCloudflareSecurityCheck(
  root?: string,
  policies?: WorkerPolicy[]
): number;

export function runCloudflareDeploymentCheck(
  root?: string,
  policies?: WorkerPolicy[]
): number;
