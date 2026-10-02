#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDirectory, "..");
const identifier = String.raw`(?:"(?:[^"]|"")+"|[a-zA-Z_][\w$]*)`;
const qualifiedIdentifier = String.raw`(${identifier})\.(${identifier})`;

function unquote(value) {
  return value.startsWith('"')
    ? value.slice(1, -1).replaceAll('""', '"')
    : value.toLowerCase();
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function stripCommentsAndBodies(source) {
  let output = "";
  let index = 0;
  let state = "normal";
  let dollarTag = "";

  while (index < source.length) {
    const pair = source.slice(index, index + 2);
    const char = source[index];

    if (state === "line-comment") {
      if (char === "\n") {
        output += "\n";
        state = "normal";
      } else output += " ";
      index += 1;
      continue;
    }
    if (state === "block-comment") {
      if (pair === "*/") {
        output += "  ";
        index += 2;
        state = "normal";
      } else {
        output += char === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (state === "single-quote") {
      if (pair === "''") {
        output += "  ";
        index += 2;
      } else if (char === "'") {
        output += "'";
        index += 1;
        state = "normal";
      } else {
        output += char === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }
    if (state === "dollar-quote") {
      if (source.startsWith(dollarTag, index)) {
        output += " ".repeat(dollarTag.length);
        index += dollarTag.length;
        state = "normal";
      } else {
        output += char === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }

    if (pair === "--") {
      output += "  ";
      index += 2;
      state = "line-comment";
      continue;
    }
    if (pair === "/*") {
      output += "  ";
      index += 2;
      state = "block-comment";
      continue;
    }
    if (char === "'") {
      output += "'";
      index += 1;
      state = "single-quote";
      continue;
    }
    if (char === "$") {
      const match = source.slice(index).match(/^\$(?:[a-zA-Z_][\w$]*)?\$/);
      if (match) {
        dollarTag = match[0];
        output += " ".repeat(dollarTag.length);
        index += dollarTag.length;
        state = "dollar-quote";
        continue;
      }
    }

    output += char;
    index += 1;
  }

  return output;
}

function splitTopLevel(value, separator = ",") {
  const parts = [];
  let part = "";
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"') {
      if (quoted && value[index + 1] === '"') {
        part += '""';
        index += 1;
        continue;
      }
      quoted = !quoted;
    }
    if (!quoted) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === separator && depth === 0) {
        parts.push(part.trim());
        part = "";
        continue;
      }
    }
    part += char;
  }
  if (part.trim()) parts.push(part.trim());
  return parts;
}

function matchingParen(source, openIndex) {
  let depth = 0;
  let quoted = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function identityArgument(parameter) {
  const withoutDefault = parameter
    .replace(/\s+(?:default\s+|=)[\s\S]*$/i, "")
    .trim();
  const withoutMode = withoutDefault
    .replace(/^(?:inout|in|out|variadic)\s+/i, "")
    .trim();
  const match = withoutMode.match(
    new RegExp(`^(?:${identifier})\\s+([\\s\\S]+)$`, "i")
  );
  const type = match?.[1] ?? withoutMode;
  return type.replace(/\s+/g, " ").replace(/\s*\[\s*\]/g, "[]").trim();
}

function canonicalFunctionSignature(statement, match) {
  const openIndex = statement.indexOf("(", match.index + match[0].length - 1);
  const closeIndex = matchingParen(statement, openIndex);
  if (openIndex === -1 || closeIndex === -1) return null;
  const params = statement.slice(openIndex + 1, closeIndex).trim();
  const types = params ? splitTopLevel(params).map(identityArgument) : [];
  return `${unquote(match[1])}.${unquote(match[2])}(${types.join(",")})`;
}

function objectKey(schema, table, name) {
  return `${schema}.${table}.${name}`;
}

export function buildDatabaseContract({ root = defaultRoot, maxMigration = Infinity } = {}) {
  const migrationsDirectory = join(root, "supabase", "migrations");
  const files = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .filter((file) => Number.parseInt(file.slice(0, 3), 10) <= maxMigration)
    .sort();

  const functions = new Set();
  const triggers = new Map();
  const removedTriggers = new Map();
  const rls = new Map();
  const policies = new Map();
  const removedPolicies = new Map();
  const grants = new Map();

  for (const file of files) {
    const source = stripCommentsAndBodies(
      readFileSync(join(migrationsDirectory, file), "utf8")
    );
    for (const statement of source.split(";").map((part) => part.trim()).filter(Boolean)) {
      const functionMatch = statement.match(
        new RegExp(
          `create\\s+(?:or\\s+replace\\s+)?function\\s+${qualifiedIdentifier}\\s*\\(`,
          "i"
        )
      );
      if (functionMatch) {
        const signature = canonicalFunctionSignature(statement, functionMatch);
        if (signature) functions.add(signature);
      }

      const createTrigger = statement.match(
        new RegExp(
          `create\\s+(?:constraint\\s+)?trigger\\s+(${identifier})[\\s\\S]*?\\bon\\s+${qualifiedIdentifier}`,
          "i"
        )
      );
      if (createTrigger) {
        const schema = unquote(createTrigger[2]);
        const table = unquote(createTrigger[3]);
        const name = unquote(createTrigger[1]);
        const key = objectKey(schema, table, name);
        triggers.set(key, { schema, table, name });
        removedTriggers.delete(key);
      }
      const dropTrigger = statement.match(
        new RegExp(
          `drop\\s+trigger\\s+(?:if\\s+exists\\s+)?(${identifier})\\s+on\\s+${qualifiedIdentifier}`,
          "i"
        )
      );
      if (dropTrigger) {
        const schema = unquote(dropTrigger[2]);
        const table = unquote(dropTrigger[3]);
        const name = unquote(dropTrigger[1]);
        const key = objectKey(schema, table, name);
        triggers.delete(key);
        removedTriggers.set(key, { schema, table, name });
      }

      const rlsMatch = statement.match(
        new RegExp(
          `alter\\s+table\\s+(?:if\\s+exists\\s+)?${qualifiedIdentifier}\\s+(enable|disable)\\s+row\\s+level\\s+security`,
          "i"
        )
      );
      if (rlsMatch) {
        const schema = unquote(rlsMatch[1]);
        const table = unquote(rlsMatch[2]);
        rls.set(`${schema}.${table}`, {
          schema,
          table,
          enabled: rlsMatch[3].toLowerCase() === "enable"
        });
      }

      const createPolicy = statement.match(
        new RegExp(
          `create\\s+policy\\s+(${identifier})\\s+on\\s+${qualifiedIdentifier}`,
          "i"
        )
      );
      if (createPolicy) {
        const schema = unquote(createPolicy[2]);
        const table = unquote(createPolicy[3]);
        const name = unquote(createPolicy[1]);
        const key = objectKey(schema, table, name);
        policies.set(key, { schema, table, name });
        removedPolicies.delete(key);
      }
      const dropPolicy = statement.match(
        new RegExp(
          `drop\\s+policy\\s+(?:if\\s+exists\\s+)?(${identifier})\\s+on\\s+${qualifiedIdentifier}`,
          "i"
        )
      );
      if (dropPolicy) {
        const schema = unquote(dropPolicy[2]);
        const table = unquote(dropPolicy[3]);
        const name = unquote(dropPolicy[1]);
        const key = objectKey(schema, table, name);
        policies.delete(key);
        removedPolicies.set(key, { schema, table, name });
      }

      const privilege = statement.match(
        /^(grant\s+execute|revoke\s+all)\s+on\s+function\s+([\s\S]+?)\s+(?:to|from)\s+([a-zA-Z_,\s]+)$/i
      );
      if (privilege) {
        const signature = privilege[2].replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").trim();
        const allowed = privilege[1].toLowerCase().startsWith("grant");
        const roles = privilege[3]
          .split(",")
          .map((role) => role.trim().toLowerCase())
          .filter(Boolean);
        if (!grants.has(signature)) grants.set(signature, new Map());
        for (const role of roles) grants.get(signature).set(role, allowed);
      }
    }
  }

  return {
    files,
    functions: [...functions].sort(),
    triggers: [...triggers.values()].sort((a, b) => objectKey(a.schema, a.table, a.name).localeCompare(objectKey(b.schema, b.table, b.name))),
    removedTriggers: [...removedTriggers.values()].filter((item) => !triggers.has(objectKey(item.schema, item.table, item.name))),
    rls: [...rls.values()].sort((a, b) => `${a.schema}.${a.table}`.localeCompare(`${b.schema}.${b.table}`)),
    policies: [...policies.values()].sort((a, b) => objectKey(a.schema, a.table, a.name).localeCompare(objectKey(b.schema, b.table, b.name))),
    removedPolicies: [...removedPolicies.values()].filter((item) => !policies.has(objectKey(item.schema, item.table, item.name))).sort((a, b) => objectKey(a.schema, a.table, a.name).localeCompare(objectKey(b.schema, b.table, b.name))),
    grants: [...grants.entries()].flatMap(([signature, roles]) =>
      [...roles.entries()].map(([role, allowed]) => ({ signature, role, allowed }))
    ).sort((a, b) => `${a.signature}:${a.role}`.localeCompare(`${b.signature}:${b.role}`))
  };
}

function values(rows, columns) {
  if (rows.length === 0) {
    return `SELECT ${columns.map((column) => `NULL::text AS ${column}`).join(", ")} WHERE false`;
  }
  return `VALUES\n${rows
    .map((row) => `    (${columns.map((column) => sqlLiteral(String(row[column]))).join(", ")})`)
    .join(",\n")}`;
}

export function renderDatabaseContractSql(contract) {
  const functionValues = values(contract.functions.map((signature) => ({ signature })), ["signature"]);
  const triggerValues = values(contract.triggers, ["schema", "table", "name"]);
  const removedTriggerValues = values(contract.removedTriggers, ["schema", "table", "name"]);
  const rlsValues = values(contract.rls.map((item) => ({ ...item, enabled: item.enabled ? "true" : "false" })), ["schema", "table", "enabled"]);
  const policyValues = values(contract.policies, ["schema", "table", "name"]);
  const removedPolicyValues = values(contract.removedPolicies, ["schema", "table", "name"]);
  const grantValues = values(contract.grants.map((item) => ({ ...item, allowed: item.allowed ? "true" : "false" })), ["signature", "role", "allowed"]);

  return `-- Generated from ordered migrations by scripts/check-db-contract.mjs.
-- Read-only catalog validation: zero persistent objects or rows are changed.
DO $db_contract$
DECLARE
  failures text;
BEGIN
  WITH
  expected_functions(signature) AS (${functionValues}),
  expected_triggers(schema_name, table_name, trigger_name) AS (${triggerValues}),
  forbidden_triggers(schema_name, table_name, trigger_name) AS (${removedTriggerValues}),
  expected_rls(schema_name, table_name, enabled) AS (${rlsValues}),
  expected_policies(schema_name, table_name, policy_name) AS (${policyValues}),
  forbidden_policies(schema_name, table_name, policy_name) AS (${removedPolicyValues}),
  expected_grants(signature, role_name, allowed) AS (${grantValues}),
  problems AS (
    SELECT 'function' AS kind, signature AS object_name, 'missing signature' AS detail
    FROM expected_functions
    WHERE to_regprocedure(signature) IS NULL
    UNION ALL
    SELECT 'trigger', schema_name || '.' || table_name || '.' || trigger_name, 'missing trigger'
    FROM expected_triggers expected
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger trigger
      JOIN pg_class relation ON relation.oid = trigger.tgrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE NOT trigger.tgisinternal
        AND namespace.nspname = expected.schema_name
        AND relation.relname = expected.table_name
        AND trigger.tgname = expected.trigger_name
    )
    UNION ALL
    SELECT 'trigger', schema_name || '.' || table_name || '.' || trigger_name, 'forbidden trigger remains'
    FROM forbidden_triggers forbidden
    WHERE EXISTS (
      SELECT 1 FROM pg_trigger trigger
      JOIN pg_class relation ON relation.oid = trigger.tgrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE NOT trigger.tgisinternal
        AND namespace.nspname = forbidden.schema_name
        AND relation.relname = forbidden.table_name
        AND trigger.tgname = forbidden.trigger_name
    )
    UNION ALL
    SELECT 'rls', schema_name || '.' || table_name, 'RLS state differs'
    FROM expected_rls expected
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = expected.schema_name
        AND relation.relname = expected.table_name
        AND relation.relrowsecurity = expected.enabled::boolean
    )
    UNION ALL
    SELECT 'policy', schema_name || '.' || table_name || '.' || policy_name, 'missing policy'
    FROM expected_policies expected
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policies policy
      WHERE policy.schemaname = expected.schema_name
        AND policy.tablename = expected.table_name
        AND policy.policyname = expected.policy_name
    )
    UNION ALL
    SELECT 'policy', schema_name || '.' || table_name || '.' || policy_name, 'forbidden policy remains'
    FROM forbidden_policies forbidden
    WHERE EXISTS (
      SELECT 1 FROM pg_policies policy
      WHERE policy.schemaname = forbidden.schema_name
        AND policy.tablename = forbidden.table_name
        AND policy.policyname = forbidden.policy_name
    )
    UNION ALL
    SELECT 'grant', signature || ' -> ' || role_name, 'EXECUTE privilege differs'
    FROM expected_grants expected
    WHERE to_regprocedure(signature) IS NULL
       OR has_function_privilege(role_name, to_regprocedure(signature), 'EXECUTE')
          IS DISTINCT FROM expected.allowed::boolean
  )
  SELECT string_agg(kind || ': ' || object_name || ' (' || detail || ')', E'\\n')
  INTO failures
  FROM problems;

  IF failures IS NOT NULL THEN
    RAISE EXCEPTION 'Database contract violations:%', E'\\n' || failures;
  END IF;

  RAISE NOTICE 'Database contract passed: ${contract.functions.length} functions, ${contract.triggers.length} triggers, ${contract.rls.length} RLS tables, ${contract.policies.length} required policies, ${contract.removedPolicies.length} forbidden policies, ${contract.grants.length} function grants.';
END
$db_contract$;
`;
}

function summary(contract) {
  return {
    migrations: contract.files.length,
    functions: contract.functions.length,
    triggers: contract.triggers.length,
    forbiddenTriggers: contract.removedTriggers.length,
    rlsTables: contract.rls.length,
    policies: contract.policies.length,
    forbiddenPolicies: contract.removedPolicies.length,
    functionGrants: contract.grants.length
  };
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isMain) {
  const maxArgument = process.argv.find((argument) => argument.startsWith("--max="));
  const maxMigration = maxArgument
    ? Number.parseInt(maxArgument.slice("--max=".length), 10)
    : Infinity;
  const contract = buildDatabaseContract({ maxMigration });
  if (process.argv.includes("--summary")) {
    console.log(JSON.stringify(summary(contract), null, 2));
  } else {
    process.stdout.write(renderDatabaseContractSql(contract));
  }
}
