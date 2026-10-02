import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  blankLeadToolSpec,
  leadToolSpecSchema,
  maxPossibleScore,
  resolveLeadToolResult,
  validateLeadToolSpec,
  validateLeadToolSpecForPublish
} from "@/lib/lead-tools/schema";
import { ACTION_CREDITS } from "@/lib/payment/types";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Lead tools (获客搭子) persistence and public contracts", () => {
  it("keeps every table tenant isolated with owner-only RLS and no anon surface", () => {
    const migration = source("supabase/migrations/112_lead_tools.sql");
    for (const table of ["lead_tools", "lead_tool_versions", "lead_tool_event_daily", "lead_tool_outcomes"]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
    // Owner policies: 4 on lead_tools + 3 on versions (no owner update) +
    // 3 on outcomes = 10. event_daily must have ZERO policies (no user_id
    // column; stats are service-role-only) — a policy there is a 42703 bug.
    expect(migration.match(/auth\.uid\(\) = user_id/g)?.length).toBeGreaterThanOrEqual(10);
    expect(migration).not.toMatch(/POLICY[^;]*ON public\.lead_tool_event_daily/i);
    expect(migration).not.toMatch(/POLICY[^;]*FOR SELECT[^;]*(anon|public)/i);
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.increment_lead_tool_event");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.increment_lead_tool_event(text, text, text, text) TO service_role");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("check (status in ('draft', 'published', 'paused', 'archived'))");
    expect(migration).toContain("check (stage in ('clicked', 'left_need', 'won'))");
  });

  it("serves the public page through the admin client with a single counted open", () => {
    const service = source("lib/lead-tools/service.ts");
    const page = source("app/t/[slug]/page.tsx");

    expect(service).toContain("createSupabaseAdminClient");
    expect(service).toContain('rpc("increment_lead_tool_event", { p_slug: slug, p_event: "open" })');
    expect(service).toContain(".eq(\"status\", \"published\")");
    // Metadata must not count an open — only the page render does.
    expect(page).toContain("findPublicLeadTool(slug)");
    expect(page).toContain("getPublicLeadTool(slug)");
    expect(page).toContain("index: false");
  });

  it("keeps anonymous writes aggregate-only and rate limited", () => {
    const route = source("app/api/public/lead-tools/[slug]/events/route.ts");
    expect(route).toContain("enforceApiRateLimit");
    // 'open' is bumped server-side during page render only — the public
    // endpoint must not accept it, or scripts could inflate opens.
    expect(route).toContain('z.enum(["complete", "cta_click"])');
    expect(route).not.toContain('"open"');
    expect(source("lib/lead-tools/service.ts")).not.toMatch(/from\("lead_tool_event_daily"\)\.insert/);
  });

  it("charges generation through the three-phase billing helper and refunds failures", () => {
    const route = source("app/api/operations/lead-tools/generate/route.ts");
    expect(route).toContain("createAiUsageBilling");
    expect(route).toContain("ACTION_CREDITS.leadToolGenerate");
    expect(route).toContain('billing.refund("lead_tool_generate_failed")');
    expect(route).toContain("INSUFFICIENT_CREDITS");
    expect(ACTION_CREDITS.leadToolGenerate).toBe(15);
  });

  it("mounts the section in the operations nav", () => {
    const nav = source("components/app-shell/OperationsSectionNav.tsx");
    expect(nav).toContain('"/operations/lead-tools"');
    expect(nav).toContain("获客搭子");
  });
});

describe("Lead tool spec schema invariants", () => {
  it("ships a valid blank scaffold", () => {
    const blank = blankLeadToolSpec();
    expect(validateLeadToolSpec(blank)).toEqual([]);
    expect(maxPossibleScore(blank)).toBe(6);
  });

  it("requires contiguous score bands covering every reachable score", () => {
    const spec = blankLeadToolSpec();
    expect(leadToolSpecSchema.safeParse(spec).success).toBe(true);

    const gapped = {
      ...spec,
      results: [
        { ...spec.results[0], min_score: 1 },
        spec.results[1]
      ]
    };
    expect(validateLeadToolSpec(gapped).some((issue) => issue.includes("分数区间应从"))).toBe(true);

    const fromOne = {
      ...spec,
      results: spec.results.map((result) => ({ ...result, min_score: result.min_score + 1 }))
    };
    expect(validateLeadToolSpec(fromOne).some((issue) => issue.includes("应从 0 分开始"))).toBe(true);

    const shortTop = {
      ...spec,
      results: [
        { ...spec.results[0], max_score: 5 },
        spec.results[1]
      ]
    };
    expect(validateLeadToolSpec(shortTop).some((issue) => issue.includes("访客最高可能得"))).toBe(true);
  });

  it("rejects results pointing at missing entries and empty entry URLs before publish", () => {
    const spec = blankLeadToolSpec();
    const dangling = {
      ...spec,
      results: spec.results.map((result) => ({ ...result, entry: "entry_missing" }))
    };
    expect(validateLeadToolSpec(dangling).some((issue) => issue.includes("不存在的入口"))).toBe(true);

    // Blank scaffold has an empty entry URL: fine as a draft, blocked at publish.
    expect(validateLeadToolSpecForPublish(spec).some((issue) => issue.includes("发布前必须补上"))).toBe(true);
    expect(validateLeadToolSpec(spec)).toEqual([]);
  });

  it("resolves visitor scores deterministically onto bands", () => {
    const spec = blankLeadToolSpec();
    const allHigh = { q1: "q1a", q2: "q2a", q3: "q3a" };
    const allLow = { q1: "q1b", q2: "q2b", q3: "q3b" };
    expect(resolveLeadToolResult(spec, allHigh)?.id).toBe("r_high");
    expect(resolveLeadToolResult(spec, allLow)?.id).toBe("r_low");
    // Unanswered questions simply contribute nothing.
    expect(resolveLeadToolResult(spec, {})?.id).toBe("r_low");
  });
});
