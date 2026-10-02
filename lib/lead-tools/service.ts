import { createSupabaseAdminClient } from "@/lib/supabase";
import { generateShareSlug } from "@/lib/slug";
import {
  blankLeadToolSpec,
  leadToolSpecSchema,
  validateLeadToolSpec,
  validateLeadToolSpecForPublish,
  type LeadToolSpec
} from "@/lib/lead-tools/schema";

type Admin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type LeadToolStatus = "draft" | "published" | "paused" | "archived";

export type LeadToolSummary = {
  id: string;
  slug: string;
  title: string;
  status: LeadToolStatus;
  updatedAt: string;
  published: boolean;
};

export type LeadToolVersionSummary = {
  id: string;
  version: number;
  note: string;
  createdAt: string;
};

export type LeadToolDetail = LeadToolSummary & {
  businessContext: string;
  spec: LeadToolSpec;
  latestVersionId: string | null;
  versions: LeadToolVersionSummary[];
};

export type LeadToolStats = {
  totals: { opens: number; completions: number; ctaClicks: number };
  last14Days: { day: string; opens: number; completions: number; ctaClicks: number }[];
  resultCounts: { resultId: string; count: number }[];
  outcomes: {
    id: string;
    occurredOn: string;
    stage: "clicked" | "left_need" | "won";
    note: string;
    createdAt: string;
  }[];
  outcomeCounts: { clicked: number; leftNeed: number; won: number };
};

const SUMMARY_FIELDS = "id,slug,title,status,updated_at";
const DETAIL_FIELDS = `${SUMMARY_FIELDS},business_context,spec,latest_version_id`;

export class LeadToolConflictError extends Error {
  constructor() {
    super("This lead tool was edited elsewhere. Reload and try again.");
  }
}

function mapStatus(value: unknown): LeadToolStatus {
  return value === "published" || value === "paused" || value === "archived" ? value : "draft";
}

function mapSummary(row: Record<string, unknown>): LeadToolSummary {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    status: mapStatus(row.status),
    updatedAt: String(row.updated_at),
    published: mapStatus(row.status) === "published"
  };
}

function mapSpec(value: unknown): LeadToolSpec {
  const parsed = leadToolSpecSchema.safeParse(value);
  if (!parsed.success) {
    // A spec that once validated should never fail its own schema; fall
    // back to the blank scaffold rather than 500-ing the owner's editor.
    // The damage surfaces as validation issues the moment they save.
    return blankLeadToolSpec();
  }
  return parsed.data;
}

export async function listLeadTools(admin: Admin, userId: string): Promise<LeadToolSummary[]> {
  const { data, error } = await admin
    .from("lead_tools")
    .select(SUMMARY_FIELDS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapSummary(row as Record<string, unknown>));
}

async function insertFirstVersion(
  admin: Admin,
  toolId: string,
  userId: string,
  spec: LeadToolSpec,
  note: string
): Promise<string> {
  const versionId = crypto.randomUUID();
  const { error } = await admin.from("lead_tool_versions").insert({
    id: versionId,
    tool_id: toolId,
    user_id: userId,
    version: 1,
    spec,
    note
  });
  if (error) throw error;
  return versionId;
}

/** Creates a draft tool (blank scaffold or generated) and its version-1 row. */
export async function createLeadTool(
  admin: Admin,
  userId: string,
  input: { title: string; businessContext: string; spec: LeadToolSpec; note?: string }
): Promise<LeadToolSummary> {
  const issues = validateLeadToolSpec(input.spec);
  if (issues.length) {
    throw new Error(issues[0]);
  }

  // Slug collisions are unlikely at 10 hex chars but retried like kit shares.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = generateShareSlug();
    const toolId = crypto.randomUUID();
    const { data: inserted, error } = await admin
      .from("lead_tools")
      .insert({
        id: toolId,
        user_id: userId,
        slug,
        title: input.title,
        business_context: input.businessContext,
        spec: input.spec,
        status: "draft"
      })
      .select(SUMMARY_FIELDS)
      .single();
    if (error) {
      if (error.code === "23505" && String(error.message).includes("slug")) {
        continue;
      }
      throw error;
    }

    const versionId = await insertFirstVersion(admin, toolId, userId, input.spec, input.note ?? "创建");
    const { error: linkError } = await admin
      .from("lead_tools")
      .update({ latest_version_id: versionId })
      .eq("id", toolId);
    if (linkError) throw linkError;

    return mapSummary(inserted as Record<string, unknown>);
  }
  throw new Error("Could not allocate a unique slug. Please retry.");
}

export async function loadLeadTool(admin: Admin, userId: string, toolId: string): Promise<LeadToolDetail | null> {
  const { data, error } = await admin
    .from("lead_tools")
    .select(DETAIL_FIELDS)
    .eq("id", toolId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const { data: versions, error: versionsError } = await admin
    .from("lead_tool_versions")
    .select("id,version,note,created_at")
    .eq("tool_id", toolId)
    .eq("user_id", userId)
    .order("version", { ascending: false });
  if (versionsError) throw versionsError;

  return {
    ...mapSummary(row),
    businessContext: String(row.business_context ?? ""),
    spec: mapSpec(row.spec),
    latestVersionId: row.latest_version_id ? String(row.latest_version_id) : null,
    versions: (versions ?? []).map((version) => ({
      id: String(version.id),
      version: Number(version.version),
      note: String(version.note ?? ""),
      createdAt: String(version.created_at)
    }))
  };
}

/**
 * Saves the draft spec as a new version. `expectedLatestVersionId`
 * optimistic-locks concurrent edits: a stale editor gets a conflict
 * instead of silently overwriting newer work.
 */
export async function updateLeadToolSpec(
  admin: Admin,
  userId: string,
  toolId: string,
  input: { spec: LeadToolSpec; note?: string; expectedLatestVersionId?: string | null }
): Promise<LeadToolDetail> {
  const issues = validateLeadToolSpec(input.spec);
  if (issues.length) {
    throw new Error(issues[0]);
  }

  const { data: current, error: currentError } = await admin
    .from("lead_tools")
    .select("id,latest_version_id")
    .eq("id", toolId)
    .eq("user_id", userId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("Lead tool not found.");
  if (
    input.expectedLatestVersionId !== undefined &&
    String((current as Record<string, unknown>).latest_version_id ?? "") !== input.expectedLatestVersionId
  ) {
    throw new LeadToolConflictError();
  }

  const { data: latest, error: latestError } = await admin
    .from("lead_tool_versions")
    .select("version")
    .eq("tool_id", toolId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;

  const versionId = crypto.randomUUID();
  const { error: versionError } = await admin.from("lead_tool_versions").insert({
    id: versionId,
    tool_id: toolId,
    user_id: userId,
    version: Number(latest?.version ?? 0) + 1,
    spec: input.spec,
    note: input.note ?? "编辑"
  });
  if (versionError) throw versionError;

  const { data: updated, error: updateError } = await admin
    .from("lead_tools")
    .update({
      title: input.spec.title,
      spec: input.spec,
      latest_version_id: versionId,
      updated_at: new Date().toISOString()
    })
    .eq("id", toolId)
    .eq("user_id", userId)
    .select(DETAIL_FIELDS)
    .single();
  if (updateError) throw updateError;
  if (!updated) throw new LeadToolConflictError();

  const detail = await loadLeadTool(admin, userId, toolId);
  if (!detail) throw new Error("Lead tool disappeared after save.");
  return detail;
}

export async function setLeadToolStatus(
  admin: Admin,
  userId: string,
  toolId: string,
  action: "publish" | "pause" | "resume" | "archive"
): Promise<LeadToolSummary> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (action === "publish") {
    const detail = await loadLeadTool(admin, userId, toolId);
    if (!detail) throw new Error("Lead tool not found.");
    const issues = validateLeadToolSpecForPublish(detail.spec);
    if (issues.length) {
      throw new Error(issues[0]);
    }
    patch.published_spec = detail.spec;
    patch.status = "published";
  } else if (action === "pause") {
    patch.status = "paused";
  } else if (action === "resume") {
    // Resume re-serves the pinned snapshot; a paused tool may also have a
    // newer draft, which only goes live through another explicit publish.
    patch.status = "published";
  } else {
    patch.status = "archived";
  }

  const { data, error } = await admin
    .from("lead_tools")
    .update(patch)
    .eq("id", toolId)
    .eq("user_id", userId)
    .select(SUMMARY_FIELDS)
    .single();
  if (error) throw error;
  if (!data) throw new Error("Lead tool not found.");
  return mapSummary(data as Record<string, unknown>);
}

/** Restores a historic version as a NEW draft version (history is append-only). */
export async function restoreLeadToolVersion(
  admin: Admin,
  userId: string,
  toolId: string,
  versionId: string
): Promise<LeadToolDetail> {
  const { data: version, error } = await admin
    .from("lead_tool_versions")
    .select("spec")
    .eq("id", versionId)
    .eq("tool_id", toolId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!version) throw new Error("Version not found.");

  return updateLeadToolSpec(admin, userId, toolId, {
    spec: mapSpec(version.spec),
    note: "恢复历史版本"
  });
}

export async function loadLeadToolStats(admin: Admin, userId: string, toolId: string): Promise<LeadToolStats | null> {
  const { data: tool, error: toolError } = await admin
    .from("lead_tools")
    .select("id")
    .eq("id", toolId)
    .eq("user_id", userId)
    .maybeSingle();
  if (toolError) throw toolError;
  if (!tool) return null;

  const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: daily, error: dailyError } = await admin
    .from("lead_tool_event_daily")
    .select("day,opens,completions,cta_clicks,result_counts")
    .eq("tool_id", toolId)
    .gte("day", since)
    .order("day", { ascending: true });
  if (dailyError) throw dailyError;

  const { data: allDaily, error: allDailyError } = await admin
    .from("lead_tool_event_daily")
    .select("opens,completions,cta_clicks,result_counts")
    .eq("tool_id", toolId);
  if (allDailyError) throw allDailyError;

  const { data: outcomes, error: outcomesError } = await admin
    .from("lead_tool_outcomes")
    .select("id,occurred_on,stage,note,created_at")
    .eq("tool_id", toolId)
    .eq("user_id", userId)
    .order("occurred_on", { ascending: false })
    .limit(50);
  if (outcomesError) throw outcomesError;

  const mergedCounts = new Map<string, number>();
  const totals = { opens: 0, completions: 0, ctaClicks: 0 };
  for (const row of allDaily ?? []) {
    totals.opens += Number(row.opens ?? 0);
    totals.completions += Number(row.completions ?? 0);
    totals.ctaClicks += Number(row.cta_clicks ?? 0);
    const counts = (row.result_counts ?? {}) as Record<string, unknown>;
    for (const [resultId, value] of Object.entries(counts)) {
      mergedCounts.set(resultId, (mergedCounts.get(resultId) ?? 0) + Number(value ?? 0));
    }
  }

  const outcomeCounts = { clicked: 0, leftNeed: 0, won: 0 };
  for (const outcome of outcomes ?? []) {
    if (outcome.stage === "clicked") outcomeCounts.clicked += 1;
    if (outcome.stage === "left_need") outcomeCounts.leftNeed += 1;
    if (outcome.stage === "won") outcomeCounts.won += 1;
  }

  return {
    totals,
    last14Days: (daily ?? []).map((row) => ({
      day: String(row.day),
      opens: Number(row.opens ?? 0),
      completions: Number(row.completions ?? 0),
      ctaClicks: Number(row.cta_clicks ?? 0)
    })),
    resultCounts: [...mergedCounts.entries()]
      .map(([resultId, count]) => ({ resultId, count }))
      .sort((a, b) => b.count - a.count),
    outcomes: (outcomes ?? []).map((row) => ({
      id: String(row.id),
      occurredOn: String(row.occurred_on),
      stage: row.stage as "clicked" | "left_need" | "won",
      note: String(row.note ?? ""),
      createdAt: String(row.created_at)
    })),
    outcomeCounts
  };
}

export async function addLeadToolOutcome(
  admin: Admin,
  userId: string,
  toolId: string,
  input: { occurredOn: string; stage: "clicked" | "left_need" | "won"; note: string }
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) {
    throw new Error("日期格式应为 YYYY-MM-DD。");
  }
  const { error } = await admin.from("lead_tool_outcomes").insert({
    tool_id: toolId,
    user_id: userId,
    occurred_on: input.occurredOn,
    stage: input.stage,
    note: input.note.slice(0, 500)
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Public surface (/t/[slug]) — migration 018 security model: admin-client
// read + the single SECURITY DEFINER counter RPC. No anonymous Postgres
// session, no per-visitor answer storage.
// ---------------------------------------------------------------------------

export type PublicLeadTool = {
  slug: string;
  title: string;
  spec: LeadToolSpec;
};

export async function findPublicLeadTool(slug: string): Promise<PublicLeadTool | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("lead_tools")
    .select("slug,title,published_spec")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const parsed = leadToolSpecSchema.safeParse(row.published_spec);
  if (!parsed.success) return null;

  return { slug: String(row.slug), title: String(row.title), spec: parsed.data };
}

/**
 * Resolves a public tool and counts the open. Awaited — on edge runtime
 * a fire-and-forget RPC is cancelled once the response streams back
 * (migration 018 / lib/kit-shares precedent).
 */
export async function getPublicLeadTool(slug: string): Promise<PublicLeadTool | null> {
  const tool = await findPublicLeadTool(slug);
  if (!tool) return null;

  const admin = createSupabaseAdminClient();
  if (admin) {
    const { error } = await admin.rpc("increment_lead_tool_event", { p_slug: slug, p_event: "open" });
    if (error) {
      console.error("[lead-tools] increment open failed:", JSON.stringify(error));
    }
  }
  return tool;
}

/** Records a visitor completion / entry click through the counter RPC. */
export async function recordLeadToolPublicEvent(
  slug: string,
  event: "complete" | "cta_click",
  resultId?: string,
  entryId?: string
): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;

  const { error } = await admin.rpc("increment_lead_tool_event", {
    p_slug: slug,
    p_event: event,
    p_result_id: resultId ?? null,
    p_entry_id: entryId ?? null
  });
  if (error) {
    console.error(`[lead-tools] increment ${event} failed:`, JSON.stringify(error));
  }
}
