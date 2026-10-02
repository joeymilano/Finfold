export interface DatabaseContractObject {
  schema: string;
  table: string;
  name: string;
}

export interface DatabaseRlsContract {
  schema: string;
  table: string;
  enabled: boolean;
}

export interface DatabaseGrantContract {
  signature: string;
  role: string;
  allowed: boolean;
}

export interface DatabaseContract {
  files: string[];
  functions: string[];
  triggers: DatabaseContractObject[];
  removedTriggers: DatabaseContractObject[];
  rls: DatabaseRlsContract[];
  policies: DatabaseContractObject[];
  removedPolicies: DatabaseContractObject[];
  grants: DatabaseGrantContract[];
}

export function buildDatabaseContract(options?: {
  root?: string;
  maxMigration?: number;
}): DatabaseContract;

export function renderDatabaseContractSql(contract: DatabaseContract): string;
