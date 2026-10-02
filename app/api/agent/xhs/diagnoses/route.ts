import { NextResponse } from "next/server";
import {
  normalizeXhsEvidenceAccountUrl,
  xhsImportAccountAssociation,
  type ImportedXhsMetricRow
} from "@/lib/agent/xhs-data-import";
import { buildXhsDiagnosis, xhsDiagnosisRequestSchema } from "@/lib/agent/xhs-coaching";
import {
  PersistedAccountInvestigationXhsDataProvider,
  resolveXhsProviderEvidence
} from "@/lib/agent/xhs-data-provider";
import { ensureActiveXhsWorkflow } from "@/lib/agent/xhs-workflow";
import { isLocalMockMode, persistenceUnavailableMessage } from "@/lib/runtime-mode";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase";
import { apiError } from "@/lib/i18n";

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const admin = createSupabaseAdminClient();
    if (!admin) {
      if (isLocalMockMode()) return NextResponse.json({ diagnoses: [], persisted: false });
      return NextResponse.json({ error: persistenceUnavailableMessage("Xiaohongshu diagnosis") }, { status: 503 });
    }
    const searchParams = new URL(request.url).searchParams;
    const limit = Math.min(20, Math.max(1, Number(searchParams.get("limit") ?? 5)));
    const diagnosisId = searchParams.get("id");
    if (diagnosisId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(diagnosisId)) {
      return NextResponse.json({ error: apiError(request.headers, "诊断 ID 格式无效。", "Invalid diagnosis ID.") }, { status: 400 });
    }
    let query = admin
      .from("xhs_diagnoses")
      .select("id, workflow_id, operating_program_id, import_id, diagnosis_type, evidence_level, primary_stage, input, report, provider_status, created_at")
      .eq("user_id", userId);
    if (diagnosisId) query = query.eq("id", diagnosisId);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return NextResponse.json({ diagnoses: data ?? [], persisted: true });
  } catch (error) {
    return diagnosisError(error, request.headers, "无法读取小红书诊断。请确认 079_xhs_diagnosis_coaching.sql 已执行。", "Could not load Xiaohongshu diagnoses.");
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const input = xhsDiagnosisRequestSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();

    if (!admin) {
      const providerResolution = await resolveXhsProviderEvidence(input.accountUrl);
      if (!isLocalMockMode()) {
        return NextResponse.json({ error: persistenceUnavailableMessage("Xiaohongshu diagnosis") }, { status: 503 });
      }
      const diagnosisId = crypto.randomUUID();
      const report = buildXhsDiagnosis({
        ...input,
        diagnosisId,
        rows: [],
        providerResolution
      });
      return NextResponse.json({ diagnosis: { id: diagnosisId, report }, persisted: false }, { status: 201 });
    }

    const providerResolution = await resolveXhsProviderEvidence(
      input.accountUrl,
      new PersistedAccountInvestigationXhsDataProvider(admin, userId)
    );

    const workflow = await ensureActiveXhsWorkflow(admin, userId);
    const importResult = input.importId
      ? await admin
          .from("agent_data_imports")
          .select("id, original_name, source_type, normalized_rows, provenance")
          .eq("id", input.importId)
          .eq("user_id", userId)
          .eq("workflow_id", workflow.id)
          .maybeSingle()
      : { data: null, error: null };
    if (importResult.error) throw importResult.error;
    if (input.importId && !importResult.data) {
      return NextResponse.json({ error: apiError(request.headers, "找不到这份导入，或它不属于当前账号工作流。", "That import was not found or does not belong to this account's workflow.") }, { status: 404 });
    }
    const importAssociation = xhsImportAccountAssociation(
      importResult.data?.provenance,
      input.accountUrl
    );
    if (importAssociation === "mismatch") {
      return NextResponse.json({ error: apiError(request.headers, "这份创作中心导入绑定了另一个小红书账号。请重新导入当前账号的数据。", "This Creator Center import belongs to a different Xiaohongshu account. Re-import the current account's data.") }, { status: 409 });
    }
    const importedRows = Array.isArray(importResult.data?.normalized_rows)
      ? importResult.data.normalized_rows as ImportedXhsMetricRow[]
      : [];

    const [programResult, coachingResult] = await Promise.all([
      admin
        .from("operating_programs")
        .select("id")
        .eq("user_id", userId)
        .eq("platform", "xiaohongshu")
        .in("status", ["draft", "active", "paused"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("xhs_coaching_programs")
        .select("id, latest_diagnosis_id, baseline")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle()
    ]);
    if (programResult.error) throw programResult.error;
    if (coachingResult.error) throw coachingResult.error;
    const program = programResult.data;
    const activeCoaching = coachingResult.data;

    if (activeCoaching) {
      const baseline = activeCoaching.baseline && typeof activeCoaching.baseline === "object"
        ? activeCoaching.baseline as Record<string, unknown>
        : {};
      const baselineAccountUrl = normalizeXhsEvidenceAccountUrl(baseline.accountUrl);
      const importProvenance = importResult.data?.provenance && typeof importResult.data.provenance === "object"
        ? importResult.data.provenance as Record<string, unknown>
        : {};
      const currentAccountUrl = input.accountUrl
        ?? normalizeXhsEvidenceAccountUrl(importProvenance.accountUrl);
      if (baselineAccountUrl && currentAccountUrl !== baselineAccountUrl) {
        return NextResponse.json({
          error: currentAccountUrl
            ? "进行中的 14 天陪跑只能重新诊断同一个小红书账号。"
            : "重新诊断需要提供与 Day 0 相同的账号链接。"
        }, { status: 409 });
      }
    }

    if (activeCoaching?.latest_diagnosis_id) {
      const { data: previousDiagnosis, error: previousDiagnosisError } = await admin
        .from("xhs_diagnoses")
        .select("import_id")
        .eq("id", activeCoaching.latest_diagnosis_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (previousDiagnosisError) throw previousDiagnosisError;
      if (!importResult.data?.id || String(previousDiagnosis?.import_id ?? "") === String(importResult.data.id)) {
        return NextResponse.json({ error: apiError(request.headers, "陪跑中的重新诊断必须先导入一份新的创作中心数据；重复导入不会生成新的对比。", "A re-diagnosis during coaching requires a fresh Creator Center import first; re-importing the same data will not create a new comparison.") }, { status: 409 });
      }
    }

    const diagnosisId = crypto.randomUUID();
    const report = buildXhsDiagnosis({
      ...input,
      diagnosisId,
      rows: importedRows,
      importLabel: String(importResult.data?.original_name ?? "创作中心导入"),
      importSourceType: importResult.data?.source_type as "pasted_text" | "screenshot" | "csv" | "xlsx" | undefined,
      importWarnings: [
        ...(importResult.data?.provenance && typeof importResult.data.provenance === "object" && Array.isArray((importResult.data.provenance as Record<string, unknown>).warnings)
          ? ((importResult.data.provenance as Record<string, unknown>).warnings as unknown[]).map(String).slice(0, 12)
          : []),
        ...(importAssociation === "legacy_unbound"
          ? ["这份历史导入创建时未绑定账号链接；本次由用户显式选择使用，仍需人工确认账号归属。"]
          : [])
      ],
      providerResolution
    });
    const diagnosisType = activeCoaching ? "rediagnosis" : "account";
    const { error: insertError } = await admin.from("xhs_diagnoses").insert({
      id: diagnosisId,
      user_id: userId,
      workflow_id: workflow.id,
      operating_program_id: program?.id ?? null,
      import_id: importResult.data?.id ?? null,
      diagnosis_type: diagnosisType,
      evidence_level: report.primaryProblem.confidence,
      primary_stage: report.primaryProblem.stage,
      input: {
        accountUrl: input.accountUrl ?? null,
        businessGoal: input.businessGoal,
        targetAudience: input.targetAudience,
        representativeNotes: input.representativeNotes,
        platformNotifications: input.platformNotifications
      },
      report,
      provider_status: report.provider
    });
    if (insertError) throw insertError;

    if (activeCoaching?.id) {
      const { error: coachingUpdateError } = await admin
        .from("xhs_coaching_programs")
        .update({ latest_diagnosis_id: diagnosisId, updated_at: new Date().toISOString() })
        .eq("id", activeCoaching.id)
        .eq("user_id", userId);
      if (coachingUpdateError) {
        await admin.from("xhs_diagnoses").delete().eq("id", diagnosisId).eq("user_id", userId);
        throw coachingUpdateError;
      }
    }

    const { error: workflowUpdateError } = await admin
      .from("xhs_workflows")
      .update({
        current_bottleneck: report.primaryProblem.stage,
        primary_metric: report.topActions[0]?.targetMetric ?? null,
        next_action: {
          kind: "xhs_coaching",
          diagnosisId,
          title: report.topActions[0]?.title,
          reason: report.topActions[0]?.reason,
          href: report.topActions[0]?.workbenchHref
        },
        updated_at: new Date().toISOString()
      })
      .eq("id", workflow.id)
      .eq("user_id", userId);
    const persistenceWarnings: string[] = [];
    if (workflowUpdateError) {
      persistenceWarnings.push("诊断已保存，但旧版小红书工作流摘要暂未同步；不影响本次诊断与陪跑对比。");
      console.error(`[xhs/diagnoses] workflow summary update failed for user=${userId}:`, workflowUpdateError);
    }

    return NextResponse.json({
      diagnosis: {
        id: diagnosisId,
        workflowId: workflow.id,
        operatingProgramId: program?.id ?? null,
        diagnosisType,
        report
      },
      persistenceWarnings,
      persisted: true
    }, { status: 201 });
  } catch (error) {
    return diagnosisError(error, request.headers, "无法完成小红书诊断。", "Could not complete the Xiaohongshu diagnosis.");
  }
}

function diagnosisError(error: unknown, headers: Headers, fallbackZh: string, fallbackEn: string) {
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: apiError(headers, "请先登录再使用小红书诊断。", "Please log in before using Xiaohongshu diagnosis.") }, { status: 401 });
  }
  const message = error instanceof Error ? error.message : "";
  const migrationMissing = /xhs_diagnoses|xhs_coaching_programs|relation .* does not exist/i.test(message);
  return NextResponse.json(
    { error: migrationMissing ? "小红书陪跑存储尚未上线，请先执行 079_xhs_diagnosis_coaching.sql。" : apiError(headers, message || fallbackZh, fallbackEn) },
    { status: migrationMissing ? 503 : 400 }
  );
}
