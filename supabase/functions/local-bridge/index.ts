// Finfold Local Bridge — Supabase Edge Function
// 部署后 URL: https://<project-ref>.supabase.co/functions/v1/local-bridge
// 本地端 saas_url 填上面 URL,云桥会拼接 /api/v1/local/* 路径,本函数按后缀路由兼容。
//
// 端点(鉴权:请求头 X-Device-Key,对应 local_devices.device_key):
//   GET  */api/v1/local/tasks                原子认领并拉取 ≤5 条 pending 任务
//   POST */api/v1/local/tasks/{id}/result    回传结果(仅 claimed→终态,幂等)
//   POST */api/v1/local/heartbeat            上报能力/版本/在线状态
//
// 环境变量 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由平台自动注入。

/// <reference lib="deno.ns" />
import { createClient } from "jsr:@supabase/supabase-js@2";

interface LocalDeviceRow {
  id: string;
  user_id: string;
  device_key: string;
  capabilities: Record<string, unknown> | null;
  version: string | null;
  last_seen: string | null;
}
interface LocalTaskRow {
  id: string;
  device_id: string | null;
  type: "collect" | "radar";
  payload: Record<string, unknown>;
  status: "pending" | "claimed" | "done" | "failed";
  result: Record<string, unknown> | null;
  created_at: string;
  claimed_at: string | null;
  finished_at: string | null;
}
type Database = {
  public: {
    Tables: {
      local_devices: { Row: LocalDeviceRow; Insert: Partial<LocalDeviceRow>; Update: Partial<LocalDeviceRow>; Relationships: [] };
      local_tasks: { Row: LocalTaskRow; Insert: Partial<LocalTaskRow>; Update: Partial<LocalTaskRow>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
type AdminClient = ReturnType<typeof createClient<Database>>;

const CLAIM_BATCH = 5;
const CLAIM_STALE_MS = 30 * 60 * 1000; // 认领超 30 分钟未回传 → 重置为 pending(自愈)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const path = new URL(req.url).pathname;
  const key = req.headers.get("x-device-key") ?? "";
  if (!key) return json(401, { error: "missing X-Device-Key" });

  const admin = createClient<Database>(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: device, error: devErr } = await admin
    .from("local_devices")
    .select("id, user_id")
    .eq("device_key", key)
    .maybeSingle();
  if (devErr) return json(500, { error: "db error" });
  if (!device) return json(401, { error: "invalid device key" });

  // ---- 路由(后缀匹配,兼容任意挂载前缀) ----
  const mResult = path.match(/\/tasks\/([0-9a-zA-Z-]+)\/result\/?$/);
  if (req.method === "POST" && mResult) return handleResult(admin, device, mResult[1], req);
  if (req.method === "POST" && /\/heartbeat\/?$/.test(path)) return handleHeartbeat(admin, device, req);
  if (req.method === "GET" && /\/tasks\/?$/.test(path)) return handlePull(admin, device);
  return json(404, { error: "not found", path });
});

// ---------------------------------------------------------------- 拉取
async function handlePull(
  admin: AdminClient,
  device: LocalDeviceRow,
): Promise<Response> {
  const now = new Date().toISOString();

  // 自愈:认领超时未回传的任务重回 pending
  await admin
    .from("local_tasks")
    .update({ status: "pending", claimed_at: null })
    .eq("device_id", device.id)
    .eq("status", "claimed")
    .lt("claimed_at", new Date(Date.now() - CLAIM_STALE_MS).toISOString());

  // 原子认领:update+returning,并发安全(PostgREST 单语句)
  const { data: claimed, error } = await admin
    .from("local_tasks")
    .update({ status: "claimed", claimed_at: now })
    .eq("device_id", device.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(CLAIM_BATCH)
    .select("id, type, payload");

  if (error) return json(500, { error: "claim failed" });

  // 顺手更新在线状态(失败不影响任务返回)
  admin.from("local_devices")
    .update({ last_seen: now })
    .eq("id", device.id)
    .then(() => {}, () => {});

  const tasks = (claimed ?? []).map((t) => ({
    id: t.id,
    type: t.type,
    payload: t.payload as Record<string, unknown>,
  }));
  return json(200, tasks);
}

// ---------------------------------------------------------------- 回传
async function handleResult(
  admin: AdminClient,
  device: LocalDeviceRow,
  taskId: string,
  req: Request,
): Promise<Response> {
  let body: { status?: string; result?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "body must be json" });
  }
  const status = body.status === "done" ? "done" : "failed";
  if (body.result !== undefined && typeof body.result !== "object") {
    return json(400, { error: "result must be an object" });
  }

  // 仅 claimed 可流转到终态 → 天然幂等,重复回传不会覆盖
  const { data: updated, error } = await admin
    .from("local_tasks")
    .update({
      status,
      result: (body.result ?? {}) as Record<string, unknown>,
      finished_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("device_id", device.id)
    .eq("status", "claimed")
    .select("id, status");

  if (error) return json(500, { error: "update failed" });
  if (!updated || updated.length === 0) {
    return json(409, { error: "task not in claimed state (unknown, done, or not this device)" });
  }
  return json(200, { ok: true, id: taskId, status });
}

// ---------------------------------------------------------------- 心跳
async function handleHeartbeat(
  admin: AdminClient,
  device: LocalDeviceRow,
  req: Request,
): Promise<Response> {
  let body: { capabilities?: string[]; version?: string } = {};
  try {
    body = await req.json();
  } catch { /* 空心跳也接受 */ }

  const patch: Record<string, unknown> = { last_seen: new Date().toISOString() };
  if (Array.isArray(body.capabilities)) patch.capabilities = body.capabilities;
  if (typeof body.version === "string") patch.version = body.version;

  const { error } = await admin.from("local_devices").update(patch).eq("id", device.id);
  if (error) return json(500, { error: "update failed" });
  return json(200, { ok: true });
}
