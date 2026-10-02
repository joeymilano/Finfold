export const maxDuration = 60;

import { NextResponse } from "next/server";
import { ensureActiveXhsWorkflow } from "@/lib/agent/xhs-workflow";
import {
  parseXhsScreenshotExtraction,
  XHS_SCREENSHOT_EXTRACTION_PROMPT
} from "@/lib/agent/xhs-screenshot-import";
import { resolveAgentPlan } from "@/lib/agent/entitlements";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  IMAGE_MULTIPART_MAX_BYTES,
  parseBoundedFormData,
  RequestBodyTooLargeError
} from "@/lib/bounded-form-data";
import { inspectMediaUpload } from "@/lib/media-upload-policy";
import { sendRawPromptWithImages } from "@/lib/llm";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { getPlanFeatures } from "@/lib/payment/entitlements";
import { ACTION_CREDITS, ensurePlanCredits } from "@/lib/payment";
import { createAiUsageBilling } from "@/lib/payment/ai-usage-billing";
import { hashGenerationRequest, resolveGenerationRequestId } from "@/lib/generation-runs";
import {
  normalizeXhsEvidenceAccountUrl,
  xhsImportStorageId
} from "@/lib/agent/xhs-data-import";
import { apiError } from "@/lib/i18n";

const BUCKET = "agent-attachments";
const MAX_SCREENSHOTS = 6;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 15 * 60;

export async function POST(request: Request) {
  const uploadedPaths: string[] = [];
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: apiError(request.headers, "截图识别需要私有存储。", "Screenshot recognition requires private storage.") }, { status: 503 });

    const plan = await resolveAgentPlan(admin, userId);
    if (!getPlanFeatures(plan).agentTools) {
      return NextResponse.json({ error: apiError(request.headers, "截图识别需要 Starter 或以上套餐。", "Screenshot recognition requires the Starter plan or above.") }, { status: 403 });
    }
    if (!checkRateLimit(`xhs-screenshot-import:${userId}`, 8, 60_000)) {
      return NextResponse.json({ error: apiError(request.headers, "截图识别过于频繁，请稍后再试。", "Too many screenshot requests — please slow down.") }, { status: 429 });
    }

    const formData = await parseBoundedFormData(request, IMAGE_MULTIPART_MAX_BYTES);
    const entries = Array.from(formData.entries());
    if (entries.some(([name, value]) =>
      (name !== "screenshots" && name !== "accountUrl")
      || (name === "screenshots" && !(value instanceof File))
      || (name === "accountUrl" && typeof value !== "string")
    )) {
      return NextResponse.json({ error: apiError(request.headers, "截图请求包含不支持的字段。", "The screenshot request contains unsupported fields.") }, { status: 400 });
    }
    const rawAccountUrl = String(formData.get("accountUrl") ?? "").trim();
    const accountUrl = rawAccountUrl ? normalizeXhsEvidenceAccountUrl(rawAccountUrl) : null;
    if (rawAccountUrl && !accountUrl) {
      return NextResponse.json({ error: apiError(request.headers, "请输入有效的 HTTPS 小红书账号链接。", "Enter a valid HTTPS Xiaohongshu profile link.") }, { status: 400 });
    }
    const files = entries
      .filter(([name]) => name === "screenshots")
      .map(([, value]) => value as File);
    if (files.length === 0) return NextResponse.json({ error: apiError(request.headers, "请选择至少一张创作中心截图。", "Select at least one Creator Center screenshot.") }, { status: 400 });
    if (files.length > MAX_SCREENSHOTS) return NextResponse.json({ error: `一次最多识别 ${MAX_SCREENSHOTS} 张截图。` }, { status: 400 });
    if (files.some((file) => file.size > MAX_FILE_BYTES)) {
      return NextResponse.json({ error: apiError(request.headers, "单张截图不能超过 8MB。", "Each screenshot must be 8MB or smaller.") }, { status: 400 });
    }
    if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: apiError(request.headers, "截图总大小不能超过 16MB。", "Screenshots must total 16MB or less.") }, { status: 400 });
    }

    const validated: Array<{ file: File; contentType: "image/jpeg" | "image/png" | "image/webp" }> = [];
    for (const file of files) {
      const inspection = await inspectMediaUpload(file);
      if (!inspection.ok) {
        return NextResponse.json({ error: `“${file.name}”不是有效的 JPEG、PNG 或 WebP 静态图片。` }, { status: 400 });
      }
      validated.push({ file, contentType: inspection.contentType });
    }

    await ensurePrivateBucket(admin);
    const urls: string[] = [];
    for (const { file, contentType } of validated) {
      const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
      const path = `${userId}/xhs-screenshot-import/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(
        path,
        await file.arrayBuffer(),
        { contentType, upsert: false }
      );
      if (uploadError) throw new Error(uploadError.message || "截图上传失败。");
      uploadedPaths.push(path);
      const { data: signed, error: signedError } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (signedError || !signed?.signedUrl) throw new Error(signedError?.message || "无法创建截图临时访问链接。");
      urls.push(signed.signedUrl);
    }

    await ensurePlanCredits(userId, plan);
    const requestId = resolveGenerationRequestId(request.headers.get("Idempotency-Key"));
    const billing = createAiUsageBilling({
      operationKey: `xhs-screenshot-import:${userId}:${requestId}`,
      userId,
      action: "quickResearch",
      cost: ACTION_CREDITS.quickResearch,
      source: "xhs_screenshot_import",
      detail: {
        requestId,
        inputFingerprint: await hashGenerationRequest(validated.map(({ file, contentType }) => ({
          name: file.name,
          size: file.size,
          contentType
        })))
      }
    });
    const reservation = await billing.reserveAndStart();
    if (reservation.outcome !== "authorized") {
      return NextResponse.json({
        error: reservation.outcome === "insufficient_credits"
          ? "当前周期 AI Credits 不足，无法识别截图。"
          : "这组截图正在处理或已经处理，请稍后重试。"
      }, { status: reservation.outcome === "insufficient_credits" ? 402 : 409 });
    }

    let providerReturned = false;
    try {
      const raw = await sendRawPromptWithImages(XHS_SCREENSHOT_EXTRACTION_PROMPT, urls);
      providerReturned = true;
      const extraction = parseXhsScreenshotExtraction(raw);
      if (extraction.rows.length === 0) {
        throw new Error("截图中没有识别到可核对的小红书指标，请换清晰截图或粘贴数据。");
      }

      const fingerprint = await hashGenerationRequest({ accountUrl, rows: extraction.rows });
      const workflow = await ensureActiveXhsWorkflow(admin, userId);
      const { data: existingImport } = await admin
        .from("agent_data_imports")
        .select("id, original_name, source_type, normalized_rows, provenance")
        .eq("user_id", userId)
        .eq("workflow_id", workflow.id)
        .contains("provenance", { fingerprint })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingImport) {
        await billing.settle();
        const existingRows = Array.isArray(existingImport.normalized_rows) ? existingImport.normalized_rows : [];
        const provenance = existingImport.provenance && typeof existingImport.provenance === "object"
          ? existingImport.provenance as Record<string, unknown>
          : {};
        return NextResponse.json({ import: {
          id: String(existingImport.id),
          name: String(existingImport.original_name ?? "创作中心截图"),
          sourceType: String(existingImport.source_type),
          rowCount: existingRows.length,
          ignoredRows: 0,
          duplicate: true,
          accountUrl: normalizeXhsEvidenceAccountUrl(provenance.accountUrl),
          warnings: Array.isArray(provenance.warnings) ? provenance.warnings : extraction.warnings
        } });
      }

      const id = await xhsImportStorageId(userId, workflow.id, fingerprint);
      const { error: insertError } = await admin.from("agent_data_imports").insert({
        id,
        user_id: userId,
        workflow_id: workflow.id,
        platform: "xiaohongshu",
        source_type: "screenshot",
        original_name: validated.map(({ file }) => file.name.slice(0, 80)).join("、").slice(0, 180),
        normalized_rows: extraction.rows,
        provenance: {
          columns: extraction.columns,
          rowCount: extraction.rows.length,
          screenshotCount: validated.length,
          warnings: extraction.warnings,
          retainedRawFile: false,
          accountUrl,
          extraction: "vision_model",
          fingerprint
        }
      });
      if (insertError) {
        if (insertError.code === "23505") {
          const { data: duplicate } = await admin
            .from("agent_data_imports")
            .select("id, original_name, source_type, normalized_rows, provenance")
            .eq("id", id)
            .eq("user_id", userId)
            .eq("workflow_id", workflow.id)
            .maybeSingle();
          if (duplicate) {
            await billing.settle();
            const duplicateRows = Array.isArray(duplicate.normalized_rows) ? duplicate.normalized_rows : [];
            const duplicateProvenance = duplicate.provenance && typeof duplicate.provenance === "object"
              ? duplicate.provenance as Record<string, unknown>
              : {};
            return NextResponse.json({ import: {
              id: String(duplicate.id),
              name: String(duplicate.original_name ?? "创作中心截图"),
              sourceType: String(duplicate.source_type),
              rowCount: duplicateRows.length,
              ignoredRows: 0,
              duplicate: true,
              accountUrl: normalizeXhsEvidenceAccountUrl(duplicateProvenance.accountUrl),
              warnings: Array.isArray(duplicateProvenance.warnings)
                ? duplicateProvenance.warnings
                : extraction.warnings
            } });
          }
        }
        throw insertError;
      }
      await billing.settle();
      return NextResponse.json({ import: {
        id,
        name: validated.length === 1 ? validated[0].file.name : `${validated.length} 张创作中心截图`,
        sourceType: "screenshot",
        rowCount: extraction.rows.length,
        ignoredRows: 0,
        duplicate: false,
        accountUrl,
        warnings: extraction.warnings
      } }, { status: 201 });
    } catch (error) {
      if (providerReturned) {
        await billing.settle().catch(() => undefined);
      } else {
        await billing.refund("xhs_screenshot_import_failed").catch(() => undefined);
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: apiError(request.headers, "截图上传请求不能超过 17MB。", "Screenshot upload requests must be 17MB or smaller.") }, { status: 413 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: apiError(request.headers, "请先登录再识别创作中心截图。", "Please log in before submitting Creator Center screenshots.") }, { status: 401 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法识别创作中心截图。" }, { status: 400 });
  } finally {
    if (uploadedPaths.length > 0) {
      const admin = createSupabaseAdminClient();
      if (admin) await admin.storage.from(BUCKET).remove(uploadedPaths).catch(() => undefined);
    }
  }
}

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

async function ensurePrivateBucket(admin: AdminClient) {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 25 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
  });
  if (error && !error.message.toLowerCase().includes("already exists")) throw new Error(error.message);
}
