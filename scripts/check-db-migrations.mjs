#!/usr/bin/env node
// 发版前数据库迁移体检：确认 supabase/migrations/ 里声明的每一张表、每一列
// 在生产库真实存在。
//
// 背景（2026-07-21 生产事故）：
//   - 迁移 035（campaign_plans 建表）从未在生产执行 → 7 天内容计划全挂（PGRST205）
//   - kit_outputs 缺 updated_at 列 → 编辑保存 100% 失败（42703）
// 这两类问题上线前无法靠 typecheck / 测试发现，只有对生产库做探针才能拦住。
//
// 原理（只需 publishable anon key，无需 service key）：
//   GET {SUPABASE_URL}/rest/v1/{table}?select={col}&limit=0
//   - 200 / 401 / 42501  → 表和列存在（RLS 拦截 anon 属正常，说明对象存在）
//   - 400 + code 42703   → 列不存在
//   - 404 + code PGRST205 → 表不存在
//
// 解析范围：migration SQL 里的
//   CREATE TABLE [IF NOT EXISTS] public.<t> (...)   —— 校验表 + 列定义
//   ALTER TABLE public.<t> ADD COLUMN [IF NOT EXISTS] <c> —— 校验列
// CREATE FUNCTION / POLICY / INDEX / TRIGGER 无法用 PostgREST 探针，跳过。
//
// 忽略机制：在迁移文件任意位置写注释
//   -- dbcheck: skip <table>            跳过整张表
//   -- dbcheck: skip <table>.<column>   跳过指定列
//
// 用法：
//   node scripts/check-db-migrations.mjs           检查全部迁移
//   npm run db:check                               检查生产库
//   npm run db:check:staging                       检查隔离 Staging 库
//
// 连接信息默认从 wrangler.toml 的 [vars] 读取（publishable 配置，非密钥），
// 可用环境变量 SUPABASE_URL / SUPABASE_ANON_KEY 覆盖（例如指向 staging）。

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

// ---------- 连接配置 ----------

function readWranglerVars(configName) {
  const toml = readFileSync(join(ROOT, configName), "utf8");
  const pick = (key) => {
    const m = toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
    return m?.[1] ?? null;
  };
  return {
    url: pick("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: pick("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

const isStaging = process.argv.includes("--staging");
const configName = isStaging ? "wrangler.staging.toml" : "wrangler.toml";
const targetLabel = isStaging ? "Staging" : "生产";
const vars = readWranglerVars(configName);
const SUPABASE_URL = (process.env.SUPABASE_URL ?? vars.url ?? "").replace(/\/$/, "");
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? vars.anonKey ?? "";

if (!SUPABASE_URL || !ANON_KEY) {
  console.error(`❌ 缺少 Supabase 连接信息（${configName} 的 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）`);
  process.exit(1);
}

// ---------- 迁移解析 ----------

const CONSTRAINT_KEYWORDS = new Set([
  "primary", "foreign", "unique", "check", "constraint", "exclude", "like",
]);

// 去掉行注释后再做语句级正则，避免注释里的示例 SQL 被当成真实声明。
// dbcheck: skip 注释在剥离前单独收集。
function parseMigration(fileName, sql) {
  const skip = new Set();
  for (const m of sql.matchAll(/--\s*dbcheck:\s*skip\s+([a-zA-Z_]\w*)(?:\.([a-zA-Z_]\w*))?/gi)) {
    skip.add(m[2] ? `${m[1].toLowerCase()}.${m[2].toLowerCase()}` : m[1].toLowerCase());
  }
  const body = sql.replace(/--[^\n]*/g, "");

  // tables: name -> { createdHere, columns: Map(col -> fileName) }
  const found = [];

  // CREATE TABLE public.x ( ... ) —— 逐字符扫描配对括号取列定义体
  const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-zA-Z_]\w*)\s*\(/gi;
  let m;
  while ((m = createRe.exec(body)) !== null) {
    const table = m[1].toLowerCase();
    const openIdx = createRe.lastIndex - 1;
    let depth = 0;
    let closeIdx = -1;
    for (let i = openIdx; i < body.length; i++) {
      if (body[i] === "(") depth++;
      else if (body[i] === ")") {
        depth--;
        if (depth === 0) { closeIdx = i; break; }
      }
    }
    if (closeIdx === -1) continue;
    const colsBody = body.slice(openIdx + 1, closeIdx);
    const columns = [];
    // 只按顶层逗号切分（括号内的逗号属于类型参数，如 numeric(10,2)）
    let part = "";
    let pDepth = 0;
    let singleQuoted = false;
    let doubleQuoted = false;
    const parts = [];
    for (let index = 0; index < colsBody.length; index += 1) {
      const ch = colsBody[index];
      const next = colsBody[index + 1];
      if (ch === "'" && !doubleQuoted) {
        if (singleQuoted && next === "'") {
          part += "''";
          index += 1;
          continue;
        }
        singleQuoted = !singleQuoted;
      } else if (ch === '"' && !singleQuoted) {
        if (doubleQuoted && next === '"') {
          part += '""';
          index += 1;
          continue;
        }
        doubleQuoted = !doubleQuoted;
      } else if (!singleQuoted && !doubleQuoted) {
        if (ch === "(") pDepth++;
        if (ch === ")") pDepth--;
      }
      if (ch === "," && pDepth === 0 && !singleQuoted && !doubleQuoted) {
        parts.push(part);
        part = "";
      } else {
        part += ch;
      }
    }
    if (part.trim()) parts.push(part);
    for (const p of parts) {
      const tok = p.trim().match(/^"?([a-zA-Z_]\w*)"?/);
      if (!tok) continue;
      const col = tok[1].toLowerCase();
      if (CONSTRAINT_KEYWORDS.has(col)) continue;
      columns.push(col);
    }
    found.push({ table, columns, file: fileName });
  }

  // ALTER TABLE public.x ADD COLUMN [IF NOT EXISTS] y
  // \s+ 可跨行，兼容 "ALTER TABLE public.x\n  ADD COLUMN ..." 写法
  const alterRe = /alter\s+table\s+(?:if\s+exists\s+)?public\.([a-zA-Z_]\w*)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-zA-Z_]\w*)"?/gi;
  while ((m = alterRe.exec(body)) !== null) {
    found.push({
      table: m[1].toLowerCase(),
      columns: [m[2].toLowerCase()],
      file: fileName,
      alterOnly: true,
    });
  }

  return { found, skip };
}

// 聚合：table -> { createFile, columns: Map(col -> file) }
const tables = new Map();
const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
for (const fileName of files) {
  const sql = readFileSync(join(MIGRATIONS_DIR, fileName), "utf8");
  const { found, skip } = parseMigration(fileName, sql);
  for (const item of found) {
    if (skip.has(item.table)) continue;
    if (!tables.has(item.table)) {
      tables.set(item.table, { createFile: item.alterOnly ? null : item.file, columns: new Map() });
    }
    const t = tables.get(item.table);
    if (!item.alterOnly && !t.createFile) t.createFile = item.file;
    for (const col of item.columns) {
      if (skip.has(`${item.table}.${col}`)) continue;
      if (!t.columns.has(col)) t.columns.set(col, item.file);
    }
  }
}

// ---------- 生产探针 ----------

async function probe(url) {
  const res = await fetch(url, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  let code = null;
  try {
    const json = await res.json();
    code = json?.code ?? null;
  } catch { /* 非 JSON 响应 */ }
  return { status: res.status, code };
}

const probeUrl = (table, cols) =>
  `${SUPABASE_URL}/rest/v1/${table}?limit=0` +
  (cols.length ? `&select=${cols.join(",")}` : "");

// 返回 { missingTable: boolean, missingColumns: string[], error?: string }
async function checkTable(table, columns) {
  const cols = [...columns.keys()];
  const first = await probe(probeUrl(table, cols));
  if (first.status === 404 || first.code === "PGRST205") {
    return { missingTable: true, missingColumns: cols };
  }
  if (first.status === 200 || first.status === 401 || first.status === 403 || first.code === "42501") {
    return { missingTable: false, missingColumns: [] };
  }
  if (first.code === "42703") {
    // 至少一列不存在 —— 逐列探针定位
    const missing = [];
    for (const col of cols) {
      const r = await probe(probeUrl(table, [col]));
      if (r.code === "42703") missing.push(col);
      else if (r.status === 404 || r.code === "PGRST205") return { missingTable: true, missingColumns: cols };
      else if (!(r.status === 200 || r.status === 401 || r.status === 403 || r.code === "42501")) {
        return { missingTable: false, missingColumns: [], error: `列 ${col} 探针异常：HTTP ${r.status} ${r.code ?? ""}` };
      }
    }
    return { missingTable: false, missingColumns: missing };
  }
  return { missingTable: false, missingColumns: [], error: `探针异常：HTTP ${first.status} ${first.code ?? ""}` };
}

// ---------- 执行 ----------

const entries = [...tables.entries()].sort(([a], [b]) => a.localeCompare(b));
console.log(`🔍 ${targetLabel}数据库迁移体检：${files.length} 个迁移文件，声明 ${entries.length} 张表、${entries.reduce((n, [, t]) => n + t.columns.size, 0)} 个列`);
console.log(`   目标库：${SUPABASE_URL}\n`);

const CONCURRENCY = 6;
const results = [];
let idx = 0;
async function worker() {
  while (idx < entries.length) {
    const [table, info] = entries[idx++];
    const r = await checkTable(table, info.columns);
    results.push({ table, info, ...r });
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const problems = results.filter((r) => r.missingTable || r.missingColumns.length > 0 || r.error);

if (problems.length === 0) {
  console.log(`✅ 全部通过：迁移声明的 ${entries.length} 张表及全部列在${targetLabel}库均存在。`);
  process.exit(0);
}

console.error(`❌ ${targetLabel}库与迁移文件不一致，发版已阻断：\n`);

// 按迁移文件分组输出，方便直接去 SQL Editor 补执行
const byFile = new Map();
for (const p of problems) {
  if (p.error) {
    console.error(`  ⚠️  ${p.table}：${p.error}（网络或权限问题，请重试）`);
    continue;
  }
  if (p.missingTable) {
    const file = p.info.createFile ?? [...p.info.columns.values()][0];
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(`表 ${p.table} 不存在（PGRST205）`);
    continue;
  }
  for (const col of p.missingColumns) {
    const file = p.info.columns.get(col);
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(`列 ${p.table}.${col} 不存在（42703）`);
  }
}
for (const [file, items] of [...byFile.entries()].sort()) {
  console.error(`  📄 supabase/migrations/${file}`);
  for (const item of items) console.error(`     - ${item}`);
}
console.error(`
处理方式：
  1. 打开 Supabase Dashboard → SQL Editor（${targetLabel}项目）
  2. 执行上面列出的迁移文件全文（CREATE TABLE / ADD COLUMN 均幂等，可安全重跑）
  3. 重新运行本检查：npm run ${isStaging ? "db:check:staging" : "db:check"}
  如某项为有意不一致（例如手工维护的表），在对应迁移文件里加注释：
  -- dbcheck: skip <table> 或 -- dbcheck: skip <table>.<column>
`);
process.exit(1);
