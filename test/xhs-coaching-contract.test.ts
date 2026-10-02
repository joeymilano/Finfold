import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Xiaohongshu coaching persistence and API contracts", () => {
  it("keeps diagnosis, programs, tasks, and check-ins tenant isolated", () => {
    const migration = source("supabase/migrations/079_xhs_diagnosis_coaching.sql");
    expect(migration).toContain("ALTER TABLE public.xhs_diagnoses ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.xhs_coaching_programs ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.xhs_coaching_tasks ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.xhs_coaching_check_ins ENABLE ROW LEVEL SECURITY");
    expect(migration.match(/auth\.uid\(\) = user_id/g)?.length).toBeGreaterThanOrEqual(8);

    const diagnosisRoute = source("app/api/agent/xhs/diagnoses/route.ts");
    const programRoute = source("app/api/agent/xhs/coaching-programs/route.ts");
    const checkInRoute = source("app/api/agent/xhs/tasks/[taskId]/check-ins/route.ts");
    expect(diagnosisRoute.match(/\.eq\("user_id", userId\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(programRoute.match(/\.eq\("user_id", userId\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(checkInRoute.match(/\.eq\("user_id", userId\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("deduplicates first-party imports by a workflow-scoped fingerprint", () => {
    const route = source("app/api/agent/xhs/data-import/route.ts");
    const screenshotRoute = source("app/api/agent/xhs/data-import/screenshots/route.ts");
    expect(route).toContain("const fingerprint = await sha256(JSON.stringify({ accountUrl, rows: normalized.rows }))");
    expect(route).toContain('.eq("workflow_id", workflowId)');
    expect(route).toContain('.contains("provenance", { fingerprint })');
    expect(route).toContain("duplicate: true");
    expect(route).toContain("xhsImportStorageId(userId, workflowId, fingerprint)");
    expect(screenshotRoute).toContain("xhsImportStorageId(userId, workflow.id, fingerprint)");
    expect(route).toContain('error.code === "23505"');
    expect(screenshotRoute).toContain('insertError.code === "23505"');
  });

  it("never silently reuses an import for a different account", () => {
    const diagnosisRoute = source("app/api/agent/xhs/diagnoses/route.ts");
    const importRoute = source("app/api/agent/xhs/data-import/route.ts");
    const screenshotRoute = source("app/api/agent/xhs/data-import/screenshots/route.ts");
    expect(diagnosisRoute).toContain("xhsImportAccountAssociation");
    expect(diagnosisRoute).toContain('importAssociation === "mismatch"');
    expect(diagnosisRoute).toContain("进行中的 14 天陪跑只能重新诊断同一个小红书账号");
    expect(diagnosisRoute).toContain(": { data: null, error: null }");
    expect(importRoute).toContain("accountUrl,");
    expect(screenshotRoute).toContain("accountUrl,");
    expect(importRoute).toContain("指定的小红书工作流不存在或已结束");
    expect(importRoute).not.toContain("activeWorkflow?.id ?? active.id");
  });

  it("supports secure, temporary Creator Center screenshot imports", () => {
    const route = source("app/api/agent/xhs/data-import/screenshots/route.ts");
    expect(route).toContain("parseBoundedFormData");
    expect(route).toContain("inspectMediaUpload");
    expect(route).toContain('source_type: "screenshot"');
    expect(route).toContain("retainedRawFile: false");
    expect(route).toContain("createAiUsageBilling");
    expect(route).toContain("finally");
    expect(route).toContain("remove(uploadedPaths)");
  });

  it("requires a re-diagnosis before Day 14 can complete the program", () => {
    const route = source("app/api/agent/xhs/tasks/[taskId]/check-ins/route.ts");
    const diagnosisRoute = source("app/api/agent/xhs/diagnoses/route.ts");
    const transactionMigration = source("supabase/migrations/082_xhs_coaching_transactions.sql");
    expect(route).toContain("Day 14 必须先导入新数据并完成重新诊断");
    expect(route).toContain("p_complete_program:");
    expect(transactionMigration).toContain("IF p_complete_program THEN");
    expect(transactionMigration).toContain("SET status = 'completed', completed_at = v_now");
    expect(diagnosisRoute).toContain("重新诊断必须先导入一份新的创作中心数据");
    expect(route).toContain("复盘指标必须使用任务定义的同一口径");
  });

  it("prevents time travel and turns Day 7 into the second-round plan", () => {
    const route = source("app/api/agent/xhs/tasks/[taskId]/check-ins/route.ts");
    const taskRoute = source("app/api/agent/xhs/tasks/[taskId]/route.ts");
    const programRoute = source("app/api/agent/xhs/coaching-programs/route.ts");
    const transactionMigration = source("supabase/migrations/082_xhs_coaching_transactions.sql");
    expect(route).toContain("不能提前提交完成证明");
    expect(route).toContain("Day 7 复盘必须填写");
    expect(route).toContain("resolveXhsRoundTwoPlan");
    expect(route).toContain("target_metric: roundTwoPlan.targetMetric");
    expect(taskRoute).toContain("Day 0、Day 7 和 Day 14 是闭环检查点，不能跳过");
    expect(programRoute).toContain('status: task.dayNumber === 0 ? "completed"');
    expect(programRoute).toContain("Day 0 基线诊断");
    expect(route).toContain("陪跑计划当前不是进行中，不能提交完成证明");
    expect(taskRoute).toContain("陪跑计划当前不是进行中，不能更新任务");
    expect(route).toContain("陪跑任务不能跳序");
    expect(taskRoute).toContain("陪跑任务不能跳序");
    expect(route.indexOf("const checkInId = String(task.id)")).toBeLessThan(route.indexOf("roundTwoPlan = resolveXhsRoundTwoPlan"));
    expect(route).toContain('admin.rpc("complete_xhs_coaching_check_in"');
    expect(programRoute).toContain('admin.rpc("create_xhs_coaching_program"');
    expect(transactionMigration).toContain("FOR UPDATE");
    expect(transactionMigration).toContain("GRANT EXECUTE ON FUNCTION public.complete_xhs_coaching_check_in");
    expect(transactionMigration).toContain("GRANT EXECUTE ON FUNCTION public.create_xhs_coaching_program");
    expect(route).toContain("storedCheckIn");
    expect(route).toContain("replayed: true");
    expect(route.indexOf('String(task.status) === "completed"')).toBeGreaterThan(route.indexOf("storedCheckInError"));
    expect(programRoute).toContain("finalRediagnosisReady && baselineReport && latestReport");
  });

  it("does not report a re-diagnosis as linked until the active program pointer is durable", () => {
    const route = source("app/api/agent/xhs/diagnoses/route.ts");
    expect(route).toContain("if (programResult.error) throw programResult.error");
    expect(route).toContain("if (coachingResult.error) throw coachingResult.error");
    expect(route).toContain("if (coachingUpdateError)");
    expect(route).toContain('from("xhs_diagnoses").delete()');
    expect(route.indexOf("if (activeCoaching?.id)")).toBeLessThan(route.indexOf("const { error: workflowUpdateError }"));
  });

  it("keeps migration 079 independent from unconfirmed Research Center migration 078", () => {
    const migration = source("supabase/migrations/079_xhs_diagnosis_coaching.sql");
    expect(migration).not.toMatch(/REFERENCES public\.research_missions/);
    expect(migration).toContain("REFERENCES public.operating_programs");
    expect(migration).toContain("REFERENCES public.xhs_workflows");
    expect(migration).toContain("REFERENCES public.agent_data_imports");
  });

  it("exposes one coaching entry and carries its task context into Workbench", () => {
    const shell = source("components/app-shell/DashboardShell.tsx");
    const mobileTabBar = source("components/app-shell/MobileTabBar.tsx");
    const sectionNav = source("components/app-shell/OperationsSectionNav.tsx");
    const workbench = source("components/workbench/DashboardWorkbench.tsx");
    // 陪跑入口收敛到运营板块页签：侧边栏/移动端「高级工具」不再重复列出。
    expect(shell.match(/href: "\/operations\/xiaohongshu"/g) ?? []).toHaveLength(0);
    expect(mobileTabBar.match(/href: "\/operations\/xiaohongshu"/g) ?? []).toHaveLength(0);
    expect(sectionNav.match(/href: "\/operations\/xiaohongshu"/g)).toHaveLength(1);
    expect(workbench).toContain('params.get("coachingProgramId")');
    expect(workbench).toContain('params.get("coachingTaskId")');
    expect(workbench).toContain('params.get("diagnosisId")');
    expect(workbench).toContain("buildXhsWorkbenchSource");
    expect(workbench).toContain("canvasRestoreComplete");
    expect(workbench).toContain("确认前不会覆盖你正在编辑的内容");
    expect(workbench).toContain('data-testid="xhs-coaching-workbench-context"');
  });

  it("forbids credential scraping in the replaceable provider boundary", () => {
    const provider = source("lib/agent/xhs-data-provider.ts");
    expect(provider).toContain("must never require creator");
    expect(provider).not.toMatch(/document\.cookie|模拟登录|private api|puppeteer|playwright/i);
    expect(provider).toContain("PersistedAccountInvestigationXhsDataProvider");
    expect(provider).toContain('.eq("user_id", this.userId)');
    expect(provider).toContain("不单独证明处罚、限流或因果关系");
  });

  it("keeps the legacy explanation path aligned with evidence-first diagnosis", () => {
    const legacyDiagnosis = source("lib/agent/xhs-diagnosis.ts");
    expect(legacyDiagnosis).toContain("Do not use universal like-count");
    expect(legacyDiagnosis).toContain("P25, median, and P75");
    expect(legacyDiagnosis).toContain("supported_hypothesis");
    expect(legacyDiagnosis).not.toMatch(/100[–-]1000 likes|saves-to-likes|comments-to-likes/i);
  });
});
