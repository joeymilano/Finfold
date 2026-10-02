import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const authMock = vi.hoisted(() => ({
  userId: "user-a",
  admin: null as unknown
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentUserId: async () => authMock.userId,
  createSupabaseAdminClient: () => authMock.admin
}));

import { DELETE as deleteKit, GET as getKit } from "@/app/api/kits/[kitId]/route";
import { PUT as updateOutput } from "@/app/api/kits/[kitId]/outputs/[outputId]/route";
import { POST as savePerformance } from "@/app/api/performance/route";
import { GET as getBrandBrain } from "@/app/api/brand-brain/route";
import { GET as getQrcodeOrder } from "@/app/api/credits/qrcode-order/[id]/route";
import { DELETE as revokeMcpToken } from "@/app/api/mcp/tokens/[tokenId]/route";
import { GET as getGenerationRun } from "@/app/api/generation-runs/[runId]/route";
import { GET as getGrowthGoal } from "@/app/api/growth-loop/goals/[goalId]/route";
import { POST as decideLearning } from "@/app/api/growth-loop/learnings/[learningId]/decision/route";

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "is"; column: string; value: unknown };

class TenantQuery {
  readonly filters: Filter[] = [];
  mutation: "update" | null = null;

  constructor(
    readonly table: string,
    private readonly rows: Row[]
  ) {}

  select() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  or() {
    return this;
  }

  update() {
    this.mutation = "update";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ kind: "is", column, value });
    return this;
  }

  async maybeSingle() {
    return { data: this.rows.find((row) => this.matches(row)) ?? null, error: null };
  }

  private matches(row: Row) {
    return this.filters.every((filter) => {
      const actual = row[filter.column];
      return filter.kind === "is"
        ? actual === filter.value || (filter.value === null && actual == null)
        : actual === filter.value;
    });
  }
}

function createTenantAdmin() {
  const rows: Record<string, Row[]> = {
    content_kits: [{ id: "kit-b", user_id: "user-b" }],
    kit_outputs: [
      {
        id: "output-b",
        kit_id: "kit-b",
        user_id: "user-b",
        platform: "linkedin",
        title: "Private title",
        body: "Private body",
        cta: "Private CTA",
        final_body: null
      }
    ],
    brand_brains: [{ user_id: "user-b", brand_name: "Private brand" }],
    credit_purchases: [
      {
        id: "order-b",
        user_id: "user-b",
        provider: "alipay_qrcode",
        credits: 100,
        amount_cents: 1000,
        status: "pending",
        order_code: "FF-PRIVATE",
        plan: null,
        expires_at: null,
        created_at: "2026-08-01T00:00:00.000Z",
        confirmed_at: null
      }
    ],
    mcp_api_tokens: [
      { id: "token-b", user_id: "user-b", revoked_at: null }
    ],
    generation_runs: [
      { id: "run-b", user_id: "user-b", status: "succeeded" }
    ],
    growth_loop_goals: [
      {
        id: "goal-b",
        user_id: "user-b",
        title: "Private goal",
        objective_type: "qualified_activations",
        metric_definition: {},
        metric_definition_version: "activation-v1",
        landing_url: "https://private.example.com/",
        channel_platform: "xiaohongshu",
        target_value: 5,
        start_at: "2026-09-01T00:00:00.000Z",
        end_at: "2026-10-01T00:00:00.000Z",
        timezone: "Asia/Shanghai",
        status: "active",
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z"
      }
    ],
    growth_learnings: [
      {
        id: "learn-b",
        user_id: "user-b",
        goal_id: null,
        mission_id: null,
        statement: "Private learning statement",
        applicable_conditions: "",
        limitations: "",
        evidence: {},
        status: "candidate",
        accepted_at: null,
        revoked_at: null,
        version: 1,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z"
      }
    ]
  };
  const queries: TenantQuery[] = [];
  const admin = {
    from(table: string) {
      const query = new TenantQuery(table, rows[table] ?? []);
      queries.push(query);
      return query;
    }
  };
  return { admin, queries };
}

function expectUserFilter(queries: TenantQuery[], table: string) {
  const query = queries.find((candidate) => candidate.table === table);
  expect(query, `missing query for ${table}`).toBeDefined();
  expect(query?.filters).toContainEqual({
    kind: "eq",
    column: "user_id",
    value: "user-a"
  });
}

beforeEach(() => {
  authMock.userId = "user-a";
});

describe("single-user tenant boundary", () => {
  it("returns 404 for another user's content kit", async () => {
    const { admin, queries } = createTenantAdmin();
    authMock.admin = admin;

    const response = await getKit(new Request("https://www.finfold.app/api/kits/kit-b"), {
      params: Promise.resolve({ kitId: "kit-b" })
    });

    expect(response.status).toBe(404);
    expectUserFilter(queries, "content_kits");
  });

  it("DELETE is idempotent for an already-absent kit (success, not 404)", async () => {
    const { admin } = createTenantAdmin();
    authMock.admin = admin;

    const response = await deleteKit(
      new Request("https://www.finfold.app/api/kits/kit-b", { method: "DELETE" }),
      { params: Promise.resolve({ kitId: "kit-b" }) }
    );

    // A kit that doesn't exist for this user is already in the deleted
    // end-state — DELETE must return success so concurrent/repeated deletes
    // don't surface as failures (root cause of the restore-toast storm).
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deleted).toBe(true);
  });

  it("cannot update another user's output UUID", async () => {
    const { admin, queries } = createTenantAdmin();
    authMock.admin = admin;

    const response = await updateOutput(
      new Request("https://www.finfold.app/api/kits/kit-b/outputs/output-b", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publishStatus: "posted" })
      }),
      { params: Promise.resolve({ kitId: "kit-b", outputId: "output-b" }) }
    );

    expect(response.status).toBe(404);
    expectUserFilter(queries, "kit_outputs");
    expect(queries.some((query) => query.mutation === "update")).toBe(false);
  });

  it("cannot attach performance metrics to another user's kit", async () => {
    const { admin, queries } = createTenantAdmin();
    authMock.admin = admin;

    const response = await savePerformance(
      new Request("https://www.finfold.app/api/performance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kitId: "kit-b",
          metrics: { platform: "linkedin" }
        })
      })
    );

    expect(response.status).toBe(404);
    expectUserFilter(queries, "content_kits");
    expect(queries.some((query) => query.table === "performance_metrics")).toBe(false);
  });

  it("does not read another user's Brand Memory", async () => {
    const { admin, queries } = createTenantAdmin();
    authMock.admin = admin;

    const response = await getBrandBrain();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.persisted).toBe(false);
    expect(body.brain.brandName).not.toBe("Private brand");
    expectUserFilter(queries, "brand_brains");
  });

  it("returns 404 for another user's QR-code order", async () => {
    const { admin, queries } = createTenantAdmin();
    authMock.admin = admin;

    const response = await getQrcodeOrder(
      new Request("https://www.finfold.app/api/credits/qrcode-order/order-b"),
      { params: Promise.resolve({ id: "order-b" }) }
    );

    expect(response.status).toBe(404);
    expectUserFilter(queries, "credit_purchases");
  });

  it("returns 404 instead of claiming to revoke another user's MCP token", async () => {
    const { admin, queries } = createTenantAdmin();
    authMock.admin = admin;

    const response = await revokeMcpToken(
      new Request("https://www.finfold.app/api/mcp/tokens/token-b", {
        method: "DELETE"
      }),
      { params: Promise.resolve({ tokenId: "token-b" }) }
    );

    expect(response.status).toBe(404);
    expectUserFilter(queries, "mcp_api_tokens");
  });

  it("returns 404 for another user's generation run", async () => {
    const { admin, queries } = createTenantAdmin();
    authMock.admin = admin;

    const response = await getGenerationRun(
      new Request("https://www.finfold.app/api/generation-runs/run-b"),
      { params: Promise.resolve({ runId: "run-b" }) }
    );

    expect(response.status).toBe(404);
    expectUserFilter(queries, "generation_runs");
  });

  it("records the tenant decision and keeps workspace_id out of logs", () => {
    const adr = readFileSync(
      join(process.cwd(), "docs/architecture/adr-001-single-user-tenancy.md"),
      "utf8"
    );
    const observability = readFileSync(
      join(process.cwd(), "docs/observability.md"),
      "utf8"
    );
    const source = readFileSync(join(process.cwd(), "lib/observability.ts"), "utf8");

    expect(adr).toContain("one authenticated Supabase user is one tenant");
    expect(adr).toContain("will not expose");
    expect(source).not.toContain("workspace_id");
    expect(observability).toContain("`workspace_id` is intentionally absent");
  });

  describe("growth loop", () => {
    beforeEach(() => {
      vi.stubEnv("FINFOLD_GROWTH_LOOP_ENABLED", "true");
      vi.stubEnv("FINFOLD_GROWTH_LOOP_PILOT_MODE", "open");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("returns 404 for another user's growth goal without leaking it", async () => {
      const { admin, queries } = createTenantAdmin();
      authMock.admin = admin;

      const response = await getGrowthGoal(
        new Request("https://www.finfold.app/api/growth-loop/goals/goal-b"),
        { params: Promise.resolve({ goalId: "goal-b" }) }
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain("Private");
      expectUserFilter(queries, "growth_loop_goals");
    });

    it("cannot decide another user's learning", async () => {
      const { admin, queries } = createTenantAdmin();
      authMock.admin = admin;

      const response = await decideLearning(
        new Request("https://www.finfold.app/api/growth-loop/learnings/learn-b/decision", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: "accept" })
        }),
        { params: Promise.resolve({ learningId: "learn-b" }) }
      );

      expect(response.status).toBe(404);
      expectUserFilter(queries, "growth_learnings");
      expect(queries.some((query) => query.mutation === "update")).toBe(false);
    });
  });
});
