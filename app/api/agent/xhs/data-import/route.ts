
import { NextResponse } from "next/server";
import { readSheet } from "read-excel-file/universal";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import {
  normalizeXhsEvidenceAccountUrl,
  normalizeXhsMetricTable,
  parseCsvTable,
  parseXhsTabularText,
  xhsImportStorageId
} from "@/lib/agent/xhs-data-import";
import { ensureActiveXhsWorkflow } from "@/lib/agent/xhs-workflow";
import { resolveAgentPlan } from "@/lib/agent/entitlements";
import { getPlanFeatures } from "@/lib/payment/entitlements";
import {
  DATA_MULTIPART_MAX_BYTES,
  parseBoundedFormData,
  RequestBodyTooLargeError
} from "@/lib/bounded-form-data";
import { apiError } from "@/lib/i18n";

const MAX_FILE_BYTES = 3 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json({ error: apiError(request.headers, "数据导入需要持久化存储。", "Data import requires persistent storage.") }, { status: 503 });
    }
    const plan = await resolveAgentPlan(admin, userId);
    if (!getPlanFeatures(plan).agentTools) {
      return NextResponse.json(
        { error: apiError(request.headers, "CSV / XLSX 私有导入需要 Starter 或以上套餐。", "Private CSV / XLSX imports require the Starter plan or above.") },
        { status: 403 }
      );
    }
    const formData = await parseBoundedFormData(request, DATA_MULTIPART_MAX_BYTES);
    const file = formData.get("file");
    const pastedText = String(formData.get("pastedText") ?? "").trim();
    const requestedWorkflowId = String(formData.get("workflowId") ?? "").trim();
    const rawAccountUrl = String(formData.get("accountUrl") ?? "").trim();
    const accountUrl = rawAccountUrl ? normalizeXhsEvidenceAccountUrl(rawAccountUrl) : null;
    if (rawAccountUrl && !accountUrl) {
      return NextResponse.json({ error: apiError(request.headers, "请输入有效的 HTTPS 小红书账号链接。", "Enter a valid HTTPS Xiaohongshu profile link.") }, { status: 400 });
    }
    if (!(file instanceof File) && pastedText.length < 10) {
      return NextResponse.json({ error: apiError(request.headers, "请上传 CSV/XLSX，或粘贴至少 10 个字符的数据。", "Upload a CSV/XLSX file or paste at least 10 characters of data.") }, { status: 400 });
    }
    if (file instanceof File && file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: apiError(request.headers, "数据文件不能超过 3MB。", "Data files must be 3MB or smaller.") }, { status: 400 });
    }

    let sourceType: "pasted_text" | "csv" | "xlsx" = "pasted_text";
    let table: unknown[][];
    let originalName: string | null = null;
    if (file instanceof File) {
      originalName = file.name.slice(0, 180);
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith(".csv") || file.type === "text/csv") {
        sourceType = "csv";
        table = parseCsvTable(await file.text());
      } else if (lowerName.endsWith(".xlsx")) {
        sourceType = "xlsx";
        table = await readSheet(await file.arrayBuffer());
      } else {
        return NextResponse.json({ error: apiError(request.headers, "只支持 CSV 和 XLSX 数据文件。", "Only CSV and XLSX data files are supported.") }, { status: 400 });
      }
    } else {
      table = parseXhsTabularText(pastedText);
    }

    const normalized = normalizeXhsMetricTable(table);
    if (normalized.rows.length === 0) {
      return NextResponse.json({ error: apiError(request.headers, "没有找到包含真实指标的数据行。", "No rows with real metrics were found.") }, { status: 400 });
    }

    const fingerprint = await sha256(JSON.stringify({ accountUrl, rows: normalized.rows }));
    const workflowId = requestedWorkflowId
      ? await resolveRequestedWorkflowId(admin, userId, requestedWorkflowId)
      : (await ensureActiveXhsWorkflow(admin, userId)).id;
    if (!workflowId) {
      return NextResponse.json({ error: apiError(request.headers, "指定的小红书工作流不存在或已结束。", "The specified Xiaohongshu workflow does not exist or has ended.") }, { status: 404 });
    }
    const { data: existingImport } = await admin
      .from("agent_data_imports")
      .select("id, original_name, source_type, normalized_rows, provenance")
      .eq("user_id", userId)
      .eq("workflow_id", workflowId)
      .contains("provenance", { fingerprint })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingImport) {
      const existingRows = Array.isArray(existingImport.normalized_rows) ? existingImport.normalized_rows : [];
      const existingProvenance = existingImport.provenance && typeof existingImport.provenance === "object"
        ? existingImport.provenance as Record<string, unknown>
        : {};
      return NextResponse.json({
        import: {
          id: String(existingImport.id),
          name: String(existingImport.original_name ?? "粘贴数据"),
          sourceType: String(existingImport.source_type),
          rowCount: existingRows.length,
          ignoredRows: Number(existingProvenance.ignoredRows ?? 0),
          duplicate: true,
          accountUrl: normalizeXhsEvidenceAccountUrl(existingProvenance.accountUrl)
        }
      });
    }

    const id = await xhsImportStorageId(userId, workflowId, fingerprint);
    const provenance = {
      originalName,
      columns: normalized.columns,
      rowCount: normalized.rows.length,
      ignoredRows: normalized.ignoredRows,
      retainedRawFile: false,
      accountUrl,
      fingerprint
    };
    const { error } = await admin.from("agent_data_imports").insert({
      id,
      user_id: userId,
      workflow_id: workflowId,
      platform: "xiaohongshu",
      source_type: sourceType,
      original_name: originalName,
      normalized_rows: normalized.rows,
      provenance
    });
    if (error) {
      if (error.code === "23505") {
        const duplicate = await loadImportById(admin, userId, workflowId, id);
        if (duplicate) return NextResponse.json({ import: duplicate });
      }
      throw error;
    }
    return NextResponse.json({
      import: {
        id,
        name: originalName ?? "粘贴数据",
        sourceType,
        rowCount: normalized.rows.length,
        ignoredRows: normalized.ignoredRows,
        duplicate: false,
        accountUrl
      }
    });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: apiError(request.headers, "数据导入请求不能超过 4MB。", "Data import requests must be 4MB or smaller.") }, { status: 413 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "请先登录再导入数据。", "Please log in before importing data.") }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "无法解析这份数据。" },
      { status: 400 }
    );
  }
}

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

async function resolveRequestedWorkflowId(
  admin: AdminClient,
  userId: string,
  requestedWorkflowId: string
): Promise<string | null> {
  const { data, error } = await admin
    .from("xhs_workflows")
    .select("id")
    .eq("id", requestedWorkflowId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

async function loadImportById(
  admin: AdminClient,
  userId: string,
  workflowId: string,
  id: string
) {
  const { data } = await admin
    .from("agent_data_imports")
    .select("id, original_name, source_type, normalized_rows, provenance")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("workflow_id", workflowId)
    .maybeSingle();
  if (!data) return null;
  const rows = Array.isArray(data.normalized_rows) ? data.normalized_rows : [];
  const provenance = data.provenance && typeof data.provenance === "object"
    ? data.provenance as Record<string, unknown>
    : {};
  return {
    id: String(data.id),
    name: String(data.original_name ?? "粘贴数据"),
    sourceType: String(data.source_type),
    rowCount: rows.length,
    ignoredRows: Number(provenance.ignoredRows ?? 0),
    duplicate: true,
    accountUrl: normalizeXhsEvidenceAccountUrl(provenance.accountUrl)
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
